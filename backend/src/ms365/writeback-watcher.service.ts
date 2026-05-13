import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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

@Injectable()
export class WritebackWatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(WritebackWatcherService.name);
  private readonly watchers = new Map<string, chokidar.FSWatcher>();
  private readonly pending = new Map<string, PendingChange>();

  constructor(
    private readonly graph: GraphClientService,
    private readonly sync: OneDriveSyncService,
  ) {}

  onModuleDestroy() {
    for (const w of this.watchers.values()) w.close().catch(() => {});
    for (const p of this.pending.values()) clearTimeout(p.timer);
  }

  startWatching(project: string): void {
    if (this.watchers.has(project)) return;
    const root = path.join(WORKSPACE_ROOT, project, 'onedrive');
    const watcher = chokidar.watch(root, {
      ignored: [/(^|[\/\\])\../, '**/.meta/**', `**/*.onedrive-stub`],
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
      await this.handleDelete(project, remotePath, root.driveId);
      return;
    }

    let stats;
    try {
      stats = await fs.stat(absPath);
    } catch {
      return;
    }
    if (!stats.isFile()) return;

    await this.handleUpload(project, absPath, remotePath, root.driveId, stats.size);
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
