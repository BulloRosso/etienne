import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { GraphClientService } from './graph-client.service';
import { OneDriveSyncService } from './onedrive-sync.service';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';
const DEBOUNCE_MS = 2000;
const INLINE_LIMIT = 4 * 1024 * 1024;

interface PendingChange {
  type: 'upload' | 'delete';
  absPath: string;
  timer: NodeJS.Timeout;
}

interface RecentUnlink {
  remotePath: string;
  driveItemId: string;
  driveId?: string;
  size?: number;
  at: number;
}

const RENAME_WINDOW_MS = 3000;

@Injectable()
export class WritebackWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WritebackWatcherService.name);
  private readonly watchers = new Map<string, chokidar.FSWatcher>();
  private readonly pending = new Map<string, PendingChange>();
  private readonly recentUnlinks = new Map<string, RecentUnlink[]>(); // project -> recent

  constructor(
    private readonly graph: GraphClientService,
    private readonly sync: OneDriveSyncService,
  ) {}

  async onModuleInit() {
    // Resume auto-sync (pull-only) for projects that had it enabled before the restart.
    // Auto-sync no longer arms chokidar — local changes require an explicit Push.
    try {
      const entries = await fs.readdir(WORKSPACE_ROOT, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const project = e.name;
        try {
          const enabled = await this.sync.getAutoSync(project);
          if (!enabled) continue;
          const roots = await this.sync.listRoots(project);
          if (roots.length === 0) continue;
          this.sync.startDeltaPolling(project);
          this.logger.log(`Resumed auto-pull for project ${project}`);
        } catch { /* no mapping yet */ }
      }
    } catch (err: any) {
      this.logger.warn(`Auto-sync resume scan failed: ${err.message}`);
    }
  }

  onModuleDestroy() {
    for (const w of this.watchers.values()) w.close().catch(() => {});
    for (const p of this.pending.values()) clearTimeout(p.timer);
  }

  startWatching(project: string): void {
    if (this.watchers.has(project)) return;
    const root = path.join(WORKSPACE_ROOT, project, 'onedrive');
    const watcher = chokidar.watch(root, {
      ignored: [/(^|[\/\\])\../, '**/.meta/**', `**/*.onedrive-stub`, `**/*.downloading`, `**/*.part`],
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    });

    watcher.on('add', (p) => this.schedule(project, p, 'upload'));
    watcher.on('change', (p) => this.schedule(project, p, 'upload'));
    watcher.on('unlink', (p) => this.schedule(project, p, 'delete'));
    watcher.on('error', (err) => this.logger.error(`watcher error for ${project}: ${err}`));

    this.watchers.set(project, watcher);
    this.logger.log(`Started write-back watcher for project ${project} at ${root}`);
  }

  stopWatching(project: string): void {
    const w = this.watchers.get(project);
    if (w) {
      w.close().catch(() => {});
      this.watchers.delete(project);
    }
  }

  private schedule(project: string, absPath: string, type: 'upload' | 'delete'): void {
    const key = `${project}::${absPath}`;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.pending.delete(key);
      this.flush(project, absPath, type).catch(err =>
        this.logger.error(`flush ${type} ${absPath} failed: ${err.message}`),
      );
    }, DEBOUNCE_MS);
    this.pending.set(key, { type, absPath, timer });
  }

  private async flush(project: string, absPath: string, type: 'upload' | 'delete'): Promise<void> {
    const resolved = await this.sync.resolveLocalToRemote(project, absPath);
    if (!resolved) {
      this.logger.warn(`Could not resolve ${absPath} to a remote path`);
      return;
    }
    const { root, remotePath } = resolved;

    if (type === 'delete') {
      // Defer the actual delete: a paired 'add' within RENAME_WINDOW_MS will
      // claim this entry as a rename and skip the network delete.
      const mapping = await this.sync.loadMapping(project);
      const entry = mapping.entries[remotePath];
      if (!entry) return;
      this.rememberUnlink(project, {
        remotePath,
        driveItemId: entry.driveItemId,
        driveId: entry.driveId,
        size: entry.size,
        at: Date.now(),
      });
      setTimeout(() => {
        // Re-check: if still in recentUnlinks (no add claimed it), perform real delete.
        const list = this.recentUnlinks.get(project) || [];
        const idx = list.findIndex(u => u.remotePath === remotePath);
        if (idx >= 0) {
          list.splice(idx, 1);
          this.handleDelete(project, remotePath, root.driveId).catch(err =>
            this.logger.error(`delayed delete ${remotePath} failed: ${err.message}`),
          );
        }
      }, RENAME_WINDOW_MS);
      return;
    }

    let stats;
    try {
      stats = await fs.stat(absPath);
    } catch {
      return;
    }
    if (!stats.isFile()) return;

    // Rename detection: did a same-size, basename-matching unlink happen recently?
    const renamed = this.claimRename(project, path.basename(absPath), stats.size, remotePath);
    if (renamed) {
      await this.handleRename(project, renamed, remotePath, root.driveId);
      return;
    }

    await this.handleUpload(project, absPath, remotePath, root.driveId, stats.size);
  }

  private rememberUnlink(project: string, u: RecentUnlink): void {
    const list = this.recentUnlinks.get(project) || [];
    const cutoff = Date.now() - RENAME_WINDOW_MS;
    const pruned = list.filter(x => x.at >= cutoff);
    pruned.push(u);
    this.recentUnlinks.set(project, pruned);
  }

  private claimRename(project: string, newBasename: string, newSize: number, newRemotePath: string): RecentUnlink | null {
    const list = this.recentUnlinks.get(project) || [];
    const cutoff = Date.now() - RENAME_WINDOW_MS;
    let bestIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      const u = list[i];
      if (u.at < cutoff) continue;
      if (u.size !== newSize) continue;
      if (u.remotePath === newRemotePath) continue;
      // Don't match an old unlink to itself (same path)
      bestIdx = i;
      break;
    }
    if (bestIdx < 0) return null;
    const claimed = list.splice(bestIdx, 1)[0];
    this.recentUnlinks.set(project, list);
    return claimed;
  }

  private async handleRename(project: string, claimed: RecentUnlink, newRemotePath: string, driveId: string | undefined): Promise<void> {
    try {
      const newName = path.basename(newRemotePath);
      await this.graph.moveOrRenameItem(project, claimed.driveItemId, newName, undefined, driveId);
      await this.sync.withMapping(project, async (m) => {
        const old = m.entries[claimed.remotePath];
        delete m.entries[claimed.remotePath];
        m.entries[newRemotePath] = {
          driveItemId: claimed.driveItemId,
          driveId,
          remotePath: newRemotePath,
          eTag: old?.eTag,
          size: claimed.size,
          lastModifiedDateTime: new Date().toISOString(),
          hydrated: old?.hydrated || true,
          lastSync: Date.now(),
        };
      });
      this.logger.log(`Renamed ${claimed.remotePath} -> ${newRemotePath}`);
    } catch (err: any) {
      this.logger.error(`Rename ${claimed.remotePath} -> ${newRemotePath} failed, falling back to delete+upload: ${err.message}`);
      await this.handleDelete(project, claimed.remotePath, driveId);
      const roots = await this.sync.listRoots(project);
      const root = roots.find(r => (r.driveId || '') === (driveId || ''));
      if (root) {
        const rel = root.remotePath
          ? newRemotePath.substring(root.remotePath.length).replace(/^\/+/, '')
          : newRemotePath;
        const absPath = path.join(root.localRoot, rel);
        try {
          const stat = await fs.stat(absPath);
          await this.handleUpload(project, absPath, newRemotePath, driveId, stat.size);
        } catch { /* not present */ }
      }
    }
  }

  private async handleUpload(project: string, absPath: string, remotePath: string, driveId: string | undefined, size: number): Promise<void> {
    const mapping = await this.sync.loadMapping(project);
    const entry = mapping.entries[remotePath];
    const fileName = path.basename(remotePath);
    const parentPath = path.dirname(remotePath).replace(/\\/g, '/');
    const parentRel = parentPath === '.' ? '' : parentPath;

    const content = await fs.readFile(absPath);

    try {
      await this.sync.withMapping(project, async (m) => {
        if (!m.pendingUploads.includes(remotePath)) m.pendingUploads.push(remotePath);
      });

      let uploaded;
      if (size <= INLINE_LIMIT) {
        uploaded = await this.graph.uploadSmallFile(project, parentRel, fileName, content, driveId);
      } else {
        uploaded = await this.graph.uploadLargeFile(project, parentRel, fileName, content, driveId);
      }

      await this.sync.withMapping(project, async (m) => {
        m.entries[remotePath] = {
          driveItemId: uploaded.id,
          driveId,
          remotePath,
          eTag: uploaded.eTag,
          size: uploaded.size,
          lastModifiedDateTime: uploaded.lastModifiedDateTime,
          hydrated: true,
          lastSync: Date.now(),
        };
        m.pendingUploads = m.pendingUploads.filter(p => p !== remotePath);
      });
      this.logger.log(`Uploaded ${remotePath} (${size} bytes)`);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 412 || status === 409) {
        await this.recordConflict(project, absPath, remotePath, content, `precondition failed (${status})`);
      } else {
        this.logger.error(`Upload of ${remotePath} failed: ${err.message}`);
        await this.sync.withMapping(project, async (m) => {
          m.pendingUploads = m.pendingUploads.filter(p => p !== remotePath);
        });
      }
    }
  }

  private async handleDelete(project: string, remotePath: string, driveId: string | undefined): Promise<void> {
    const mapping = await this.sync.loadMapping(project);
    const entry = mapping.entries[remotePath];
    if (!entry) return;
    try {
      await this.graph.deleteItem(project, entry.driveItemId, driveId);
      await this.sync.withMapping(project, async (m) => {
        delete m.entries[remotePath];
      });
      this.logger.log(`Deleted ${remotePath}`);
    } catch (err: any) {
      this.logger.error(`Delete of ${remotePath} failed: ${err.message}`);
    }
  }

  private async recordConflict(project: string, absPath: string, remotePath: string, content: Buffer, reason: string): Promise<void> {
    const conflictDir = path.join(WORKSPACE_ROOT, project, 'onedrive', '.meta', 'conflicts');
    await fs.mkdir(conflictDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = remotePath.replace(/[\/\\]/g, '__');
    const conflictPath = path.join(conflictDir, `${ts}-${safeName}`);
    await fs.writeFile(conflictPath, content);
    await this.sync.withMapping(project, async (m) => {
      m.conflicts.push({ localPath: conflictPath, timestamp: Date.now(), reason });
      m.pendingUploads = m.pendingUploads.filter(p => p !== remotePath);
    });
    this.logger.warn(`Conflict recorded for ${remotePath}: ${reason}`);
  }

  isWatching(project: string): boolean {
    return this.watchers.has(project);
  }
}
