import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { GraphClientService, DriveItem } from './graph-client.service';
import { FilesystemEventsService } from './filesystem-events.service';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';
const STUB_EXT = '.onedrive-stub';

export interface SyncRoot {
  driveId?: string;
  remotePath: string;
  localRoot: string;
  label: string;
}

export interface MappingEntry {
  driveItemId: string;
  driveId?: string;
  remotePath: string;
  eTag?: string;
  size?: number;
  lastModifiedDateTime?: string;
  hydrated: boolean;
  lastSync: number;
}

export interface ProjectMapping {
  version: 1;
  roots: SyncRoot[];
  deltaTokens: Record<string, string>;
  entries: Record<string, MappingEntry>;
  pendingUploads: string[];
  conflicts: Array<{ localPath: string; timestamp: number; reason: string }>;
  autoSync?: boolean;
}

interface ExcludeConfig {
  patterns: string[];
  maxSize?: number;
}

const DEFAULT_EXCLUDES: ExcludeConfig = {
  patterns: ['~$*', '*.tmp', '.DS_Store', 'Thumbs.db'],
  maxSize: 500 * 1024 * 1024,
};

function projectOneDriveRoot(project: string): string {
  return path.join(WORKSPACE_ROOT, project, 'onedrive');
}

function metaDir(project: string): string {
  return path.join(projectOneDriveRoot(project), '.meta');
}

function safeJoinProject(project: string, ...segments: string[]): string {
  const root = path.normalize(projectOneDriveRoot(project));
  const target = path.normalize(path.join(root, ...segments));
  if (!target.startsWith(root)) throw new Error('Path traversal blocked');
  return target;
}

function matchesExclude(name: string, excludes: ExcludeConfig): boolean {
  for (const pat of excludes.patterns) {
    const rx = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (rx.test(name)) return true;
  }
  return false;
}

@Injectable()
export class OneDriveSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(OneDriveSyncService.name);
  private readonly mappingLocks = new Map<string, Promise<void>>();
  private readonly deltaTimers = new Map<string, NodeJS.Timeout>();
  private readonly DELTA_INTERVAL_MS = Number(process.env.MS365_DELTA_INTERVAL_MS || 20 * 1000);

  constructor(
    private readonly graph: GraphClientService,
    private readonly fsEvents: FilesystemEventsService,
  ) {}

  onModuleDestroy() {
    for (const t of this.deltaTimers.values()) clearInterval(t);
  }

  // ============================================
  // Mapping persistence
  // ============================================

  private mappingPath(project: string): string {
    return path.join(metaDir(project), 'mapping.json');
  }

  private excludePath(project: string): string {
    return path.join(metaDir(project), 'exclude.json');
  }

  private async ensureMetaDir(project: string): Promise<void> {
    await fs.mkdir(metaDir(project), { recursive: true });
  }

  async loadMapping(project: string): Promise<ProjectMapping> {
    await this.ensureMetaDir(project);
    try {
      const raw = await fs.readFile(this.mappingPath(project), 'utf8');
      const m = JSON.parse(raw) as ProjectMapping;
      if (m.autoSync === undefined) m.autoSync = true; // default-on for existing mappings
      return m;
    } catch {
      return { version: 1, roots: [], deltaTokens: {}, entries: {}, pendingUploads: [], conflicts: [], autoSync: true };
    }
  }

  async saveMapping(project: string, mapping: ProjectMapping): Promise<void> {
    await this.ensureMetaDir(project);
    const tmp = this.mappingPath(project) + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(mapping, null, 2), 'utf8');
    await fs.rename(tmp, this.mappingPath(project));
  }

  async withMapping<T>(project: string, fn: (m: ProjectMapping) => Promise<T>): Promise<T> {
    while (this.mappingLocks.has(project)) await this.mappingLocks.get(project);
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));
    this.mappingLocks.set(project, gate);
    try {
      const mapping = await this.loadMapping(project);
      const result = await fn(mapping);
      await this.saveMapping(project, mapping);
      return result;
    } finally {
      this.mappingLocks.delete(project);
      release();
    }
  }

  async loadExcludes(project: string): Promise<ExcludeConfig> {
    try {
      const raw = await fs.readFile(this.excludePath(project), 'utf8');
      return { ...DEFAULT_EXCLUDES, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_EXCLUDES;
    }
  }

  // ============================================
  // Roots: what gets mirrored
  // ============================================

  async addRoot(project: string, root: Omit<SyncRoot, 'localRoot'>): Promise<SyncRoot> {
    const label = root.label || (root.driveId ? `drive-${root.driveId.substring(0, 8)}` : 'me');
    const localRoot = safeJoinProject(project, label, ...(root.remotePath ? root.remotePath.split('/').filter(Boolean) : []));
    await fs.mkdir(localRoot, { recursive: true });
    const full: SyncRoot = { ...root, label, localRoot };
    await this.withMapping(project, async (m) => {
      const exists = m.roots.find(r => r.label === label && r.driveId === root.driveId && r.remotePath === root.remotePath);
      if (!exists) m.roots.push(full);
    });
    return full;
  }

  async listRoots(project: string): Promise<SyncRoot[]> {
    const m = await this.loadMapping(project);
    return m.roots;
  }

  async removeRoot(project: string, label: string): Promise<{ purgedEntries: number; localRoot?: string }> {
    let purgedEntries = 0;
    let localRoot: string | undefined;

    // First read what we need before mutating.
    const mapping = await this.loadMapping(project);
    const root = mapping.roots.find(r => r.label === label);
    if (!root) {
      return { purgedEntries: 0 };
    }
    localRoot = root.localRoot;

    // Identify entries that belong to this root and remove them.
    const entryKeys = Object.keys(mapping.entries).filter(p => {
      const e = mapping.entries[p];
      if ((e.driveId || '') !== (root.driveId || '')) return false;
      if (!root.remotePath) return true; // root is drive-root, owns everything for this driveId
      return p === root.remotePath || p.startsWith(root.remotePath + '/');
    });

    await this.withMapping(project, async (m) => {
      m.roots = m.roots.filter(r => r.label !== label);
      delete m.deltaTokens[label];
      for (const k of entryKeys) {
        delete m.entries[k];
        purgedEntries++;
      }
    });

    // Best-effort: remove the local mirror directory.
    if (localRoot) {
      try {
        await fs.rm(localRoot, { recursive: true, force: true });
        this.fsEvents.emit({ type: 'fs.removed', project, path: localRoot, source: 'onedrive' });
      } catch (err: any) {
        this.logger.warn(`Could not remove local mirror ${localRoot}: ${err.message}`);
      }
    }

    return { purgedEntries, localRoot };
  }

  async hasAnyRoots(project: string): Promise<boolean> {
    const m = await this.loadMapping(project);
    return m.roots.length > 0;
  }

  // ============================================
  // Tree materialization: download files, mkdir folders
  // ============================================

  async stubTree(project: string, rootLabel?: string): Promise<{ files: number; folders: number; skipped: number; stubs: number }> {
    const mapping = await this.loadMapping(project);
    const excludes = await this.loadExcludes(project);
    const roots = rootLabel ? mapping.roots.filter(r => r.label === rootLabel) : mapping.roots;
    let files = 0, folders = 0, skipped = 0, stubs = 0;

    for (const root of roots) {
      const walk = async (remotePath: string, localDir: string): Promise<void> => {
        const children = await this.graph.getChildrenByPath(project, remotePath, root.driveId);
        await fs.mkdir(localDir, { recursive: true });
        for (const child of children) {
          if (!child.name || matchesExclude(child.name, excludes)) continue;
          const childRemote = remotePath ? `${remotePath}/${child.name}` : child.name;
          if (child.folder) {
            folders++;
            await this.recordEntry(project, child, childRemote, root.driveId, false);
            const childLocal = path.join(localDir, child.name);
            await walk(childRemote, childLocal);
          } else if (child.file || child.size != null) {
            if (child.size && excludes.maxSize && child.size > excludes.maxSize) {
              skipped++;
              continue;
            }
            const ok = await this.materialize(project, root, childRemote, child);
            if (ok) files++;
            else stubs++;
            await this.recordEntry(project, child, childRemote, root.driveId, ok);
          }
        }
      };
      try {
        await walk(root.remotePath, root.localRoot);
      } catch (err: any) {
        this.logger.error(`stubTree failed for root ${root.label}: ${err.message}`);
      }
    }
    return { files, folders, skipped, stubs };
  }

  private async recordEntry(project: string, item: DriveItem, remotePath: string, driveId?: string, hydrated = false): Promise<void> {
    await this.withMapping(project, async (m) => {
      m.entries[remotePath] = {
        driveItemId: item.id,
        driveId,
        remotePath,
        eTag: item.eTag,
        size: item.size,
        lastModifiedDateTime: item.lastModifiedDateTime,
        hydrated,
        lastSync: Date.now(),
      };
    });
  }

  // ============================================
  // Hydrate: replace a stub with real content
  // ============================================

  async hydratePath(project: string, remotePath: string): Promise<{ localPath: string; bytes: number }> {
    const mapping = await this.loadMapping(project);
    const entry = mapping.entries[remotePath];
    if (!entry) throw new Error(`No mapping entry for remote path ${remotePath}`);
    const root = mapping.roots.find(r => (entry.driveId || '') === (r.driveId || '') && remotePath.startsWith(r.remotePath));
    if (!root) throw new Error(`No sync root covers ${remotePath}`);

    const rel = remotePath.substring(root.remotePath.length).replace(/^\/+/, '');
    const localPath = path.join(root.localRoot, rel);
    const stubPath = localPath + STUB_EXT;

    const buf = await this.graph.downloadItemContent(project, entry.driveItemId, entry.driveId);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const existed = await this.pathExists(localPath);
    await fs.writeFile(localPath, buf);
    try { await fs.unlink(stubPath); } catch { /* no stub */ }

    await this.withMapping(project, async (m) => {
      if (m.entries[remotePath]) {
        m.entries[remotePath].hydrated = true;
        m.entries[remotePath].lastSync = Date.now();
      }
    });
    this.fsEvents.emit({ type: existed ? 'fs.changed' : 'fs.added', project, path: localPath, source: 'onedrive' });
    return { localPath, bytes: buf.length };
  }

  // ============================================
  // Local path -> remote resolution (for write-back)
  // ============================================

  async resolveLocalToRemote(project: string, absLocalPath: string): Promise<{ root: SyncRoot; remotePath: string } | null> {
    const mapping = await this.loadMapping(project);
    const normalized = path.normalize(absLocalPath);
    for (const root of mapping.roots) {
      const normRoot = path.normalize(root.localRoot);
      if (normalized === normRoot || normalized.startsWith(normRoot + path.sep)) {
        let rel = path.relative(normRoot, normalized).replace(/\\/g, '/');
        if (rel.endsWith(STUB_EXT)) rel = rel.slice(0, -STUB_EXT.length);
        const remotePath = root.remotePath ? `${root.remotePath}/${rel}` : rel;
        return { root, remotePath };
      }
    }
    return null;
  }

  // ============================================
  // Delta polling
  // ============================================

  startDeltaPolling(project: string): void {
    if (this.deltaTimers.has(project)) return;
    const timer = setInterval(() => {
      this.runDelta(project).catch(err => this.logger.error(`delta poll failed for ${project}: ${err.message}`));
    }, this.DELTA_INTERVAL_MS);
    this.deltaTimers.set(project, timer);
    this.logger.log(`Started delta polling for project ${project} every ${this.DELTA_INTERVAL_MS}ms`);
  }

  stopDeltaPolling(project: string): void {
    const t = this.deltaTimers.get(project);
    if (t) {
      clearInterval(t);
      this.deltaTimers.delete(project);
    }
  }

  async runDelta(project: string): Promise<{ changed: number; added: number; renamed: number; removed: number }> {
    const mapping = await this.loadMapping(project);
    const excludes = await this.loadExcludes(project);
    let changed = 0, added = 0, renamed = 0, removed = 0;

    for (const root of mapping.roots) {
      const prevToken = mapping.deltaTokens[root.label];
      try {
        let token: string | undefined = prevToken;
        let cursor: string | undefined = prevToken;
        do {
          const { items, nextLink, deltaLink } = await this.graph.getDelta(project, cursor, root.driveId);
          for (const item of items) {
            // Skip drive root marker (it has root:{} and no parent)
            if (item.root) continue;

            // Find any existing mapping entry with this driveItemId
            const existingPath = Object.keys(mapping.entries).find(
              p => mapping.entries[p].driveItemId === item.id,
            );

            // Deletion: Graph may omit name / parentReference. Use the cached path.
            if (item.deleted) {
              if (existingPath) {
                await this.removeLocalAndMapping(project, mapping, root, existingPath);
                removed++;
                changed++;
              }
              continue;
            }

            // Non-deletion items must have a name.
            if (!item.name) continue;
            if (matchesExclude(item.name, excludes)) continue;

            // Build remote path from parentReference.path:
            //   personal:  /drive/root:/Folder
            //   org/sp:    /drives/<id>/root:/Folder
            const rawParent = item.parentReference?.path || '';
            const parentPath = rawParent
              .replace(/^\/drives\/[^/]+\/root:?\/?/, '')
              .replace(/^\/drive\/root:?\/?/, '');
            const remotePath = parentPath ? `${parentPath}/${item.name}` : item.name;
            if (root.remotePath && !remotePath.startsWith(root.remotePath)) continue;

            if (existingPath && existingPath !== remotePath) {
              // Rename: move local file/stub and update mapping key
              await this.renameLocalAndMapping(project, mapping, root, existingPath, remotePath, item);
              renamed++;
              changed++;
            } else if (!existingPath) {
              // New item: download immediately (or mkdir for folders).
              const ok = await this.materialize(project, root, remotePath, item);
              await this.recordEntry(project, item, remotePath, root.driveId, ok && !item.folder);
              mapping.entries[remotePath] = {
                driveItemId: item.id,
                driveId: root.driveId,
                remotePath,
                eTag: item.eTag,
                size: item.size,
                lastModifiedDateTime: item.lastModifiedDateTime,
                hydrated: ok && !item.folder,
                lastSync: Date.now(),
              };
              added++;
              changed++;
            } else {
              // Same path, content changed remotely.
              // If we already had a hydrated local copy, re-download to reflect the new bytes.
              if (mapping.entries[existingPath]?.hydrated && !item.folder) {
                await this.materialize(project, root, remotePath, item);
              }
              await this.recordEntry(project, item, remotePath, root.driveId, mapping.entries[remotePath]?.hydrated || false);
              changed++;
            }
          }
          cursor = nextLink;
          if (deltaLink) token = deltaLink;
        } while (cursor);
        if (token) {
          await this.withMapping(project, async (m) => {
            m.deltaTokens[root.label] = token!;
          });
        }
      } catch (err: any) {
        if (/MS365 not connected/.test(err.message)) {
          // Project hasn't connected MS365 — nothing to sync, not an error.
          this.logger.debug(`delta for root ${root.label} skipped: ${err.message}`);
        } else {
          this.logger.error(`delta for root ${root.label} failed: ${err.message}`);
        }
      }
    }
    return { changed, added, renamed, removed };
  }

  // ============================================
  // File-system reconciliation helpers
  // ============================================

  private localPathFor(root: SyncRoot, remotePath: string): string {
    const rel = root.remotePath
      ? remotePath.substring(root.remotePath.length).replace(/^\/+/, '')
      : remotePath;
    return path.join(root.localRoot, rel);
  }

  private async materialize(project: string, root: SyncRoot, remotePath: string, item: DriveItem): Promise<boolean> {
    const local = this.localPathFor(root, remotePath);
    if (item.folder) {
      const existed = await this.pathExists(local);
      await fs.mkdir(local, { recursive: true });
      if (!existed) this.fsEvents.emit({ type: 'fs.added', project, path: local, isDir: true, source: 'onedrive' });
      return true;
    }
    if (!item.file && !item.size) {
      // Unknown type; leave a stub for safety
      return false;
    }
    // Download and write atomically, staging in .meta/downloading/ so the temp
    // file is never visible in the user-facing tree.
    try {
      const buf = await this.graph.downloadItemContent(project, item.id, root.driveId);
      await fs.mkdir(path.dirname(local), { recursive: true });
      const stagingDir = path.join(metaDir(project), 'downloading');
      await fs.mkdir(stagingDir, { recursive: true });
      const tmp = path.join(stagingDir, `${item.id}-${Date.now()}.part`);
      await fs.writeFile(tmp, buf);
      const existed = await this.pathExists(local);
      await fs.rename(tmp, local);
      // Remove any leftover stub from prior runs.
      try { await fs.unlink(local + STUB_EXT); } catch { /* ignore */ }
      this.fsEvents.emit({ type: existed ? 'fs.changed' : 'fs.added', project, path: local, source: 'onedrive' });
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to materialize ${remotePath}: ${err.message}. Falling back to stub.`);
      await fs.mkdir(path.dirname(local), { recursive: true });
      const stubPath = local + STUB_EXT;
      await fs.writeFile(stubPath, JSON.stringify({
        driveItemId: item.id,
        driveId: root.driveId,
        remotePath,
        size: item.size,
        eTag: item.eTag,
        error: err.message,
      }, null, 2));
      return false;
    }
  }

  private async renameLocalAndMapping(
    project: string,
    mapping: ProjectMapping,
    root: SyncRoot,
    oldRemote: string,
    newRemote: string,
    item: DriveItem,
  ): Promise<void> {
    const oldEntry = mapping.entries[oldRemote];
    const oldLocal = this.localPathFor(root, oldRemote);
    const newLocal = this.localPathFor(root, newRemote);
    await fs.mkdir(path.dirname(newLocal), { recursive: true });

    // Move either the hydrated file or its stub, whichever exists.
    const candidates = oldEntry?.hydrated
      ? [oldLocal, oldLocal + STUB_EXT]
      : [oldLocal + STUB_EXT, oldLocal];
    for (const src of candidates) {
      try {
        const dst = src.endsWith(STUB_EXT) ? newLocal + STUB_EXT : newLocal;
        await fs.rename(src, dst);
        break;
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    // If neither existed (e.g., folder), at least ensure the new dir exists for folders.
    if (item.folder) {
      await fs.mkdir(newLocal, { recursive: true });
    }

    await this.withMapping(project, async (m) => {
      const moved = m.entries[oldRemote];
      delete m.entries[oldRemote];
      m.entries[newRemote] = {
        ...(moved || {}),
        driveItemId: item.id,
        driveId: root.driveId,
        remotePath: newRemote,
        eTag: item.eTag,
        size: item.size,
        lastModifiedDateTime: item.lastModifiedDateTime,
        hydrated: moved?.hydrated || false,
        lastSync: Date.now(),
      };
    });

    this.fsEvents.emit({ type: 'fs.renamed', project, from: oldLocal, to: newLocal, source: 'onedrive' });
  }

  private async removeLocalAndMapping(
    project: string,
    mapping: ProjectMapping,
    root: SyncRoot,
    remotePath: string,
  ): Promise<void> {
    const entry = mapping.entries[remotePath];
    const local = this.localPathFor(root, remotePath);
    const stub = local + STUB_EXT;
    for (const p of [local, stub]) {
      try { await fs.unlink(p); } catch (err: any) {
        if (err.code !== 'ENOENT' && err.code !== 'EISDIR' && err.code !== 'EPERM') throw err;
      }
    }
    // Folder cleanup
    if (entry && !entry.size) {
      try { await fs.rm(local, { recursive: true, force: true }); } catch { /* swallow */ }
    }
    await this.withMapping(project, async (m) => {
      delete m.entries[remotePath];
    });

    this.fsEvents.emit({ type: 'fs.removed', project, path: local, source: 'onedrive' });
  }

  private async pathExists(p: string): Promise<boolean> {
    try { await fs.access(p); return true; } catch { return false; }
  }

  // ============================================
  // Manual push: scan local mirror, send adds/deletes to OneDrive
  // ============================================

  async pushNow(project: string): Promise<{ uploaded: number; deleted: number; failed: number; skipped: number }> {
    const mapping = await this.loadMapping(project);
    const excludes = await this.loadExcludes(project);
    let uploaded = 0, deleted = 0, failed = 0, skipped = 0;

    for (const root of mapping.roots) {
      // 1. Walk the local mirror, collecting actual files.
      const localPaths = new Set<string>();
      try {
        await this.walkLocal(root.localRoot, localPaths);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          this.logger.error(`pushNow: walk failed for ${root.localRoot}: ${err.message}`);
        }
      }

      // 2. For each local file: upload if not in mapping or content changed.
      for (const absPath of localPaths) {
        const rel = path.relative(root.localRoot, absPath).replace(/\\/g, '/');
        if (matchesExclude(path.basename(rel), excludes)) { skipped++; continue; }
        const remotePath = root.remotePath ? `${root.remotePath}/${rel}` : rel;
        const entry = mapping.entries[remotePath];

        let stat;
        try { stat = await fs.stat(absPath); } catch { continue; }
        if (!stat.isFile()) continue;
        if (excludes.maxSize && stat.size > excludes.maxSize) { skipped++; continue; }

        // Skip if mapping says identical size + hydrated (cheap proxy for "no local change").
        if (entry && entry.hydrated && entry.size === stat.size) {
          continue;
        }

        try {
          const content = await fs.readFile(absPath);
          const parentRel = path.dirname(remotePath).replace(/\\/g, '/');
          const parentPath = parentRel === '.' ? '' : parentRel;
          const fileName = path.basename(remotePath);
          const item = content.length <= 4 * 1024 * 1024
            ? await this.graph.uploadSmallFile(project, parentPath, fileName, content, root.driveId)
            : await this.graph.uploadLargeFile(project, parentPath, fileName, content, root.driveId);

          await this.withMapping(project, async (m) => {
            m.entries[remotePath] = {
              driveItemId: item.id,
              driveId: root.driveId,
              remotePath,
              eTag: item.eTag,
              size: item.size,
              lastModifiedDateTime: item.lastModifiedDateTime,
              hydrated: true,
              lastSync: Date.now(),
            };
          });
          uploaded++;
          this.logger.log(`pushNow: uploaded ${remotePath}`);
        } catch (err: any) {
          this.logger.error(`pushNow: upload ${remotePath} failed: ${err.message}`);
          failed++;
        }
      }

      // 3. For each entry that's hydrated but missing locally: delete on OneDrive.
      for (const [remotePath, entry] of Object.entries(mapping.entries)) {
        if ((entry.driveId || '') !== (root.driveId || '')) continue;
        if (root.remotePath && !remotePath.startsWith(root.remotePath)) continue;
        if (!entry.hydrated) continue;
        const rel = root.remotePath
          ? remotePath.substring(root.remotePath.length).replace(/^\/+/, '')
          : remotePath;
        const absPath = path.join(root.localRoot, rel);
        if (localPaths.has(path.normalize(absPath))) continue;
        // Local file is gone — propagate the delete remotely.
        try {
          await this.graph.deleteItem(project, entry.driveItemId, entry.driveId);
          await this.withMapping(project, async (m) => {
            delete m.entries[remotePath];
          });
          deleted++;
          this.logger.log(`pushNow: deleted ${remotePath} on OneDrive`);
        } catch (err: any) {
          this.logger.error(`pushNow: delete ${remotePath} failed: ${err.message}`);
          failed++;
        }
      }
    }

    return { uploaded, deleted, failed, skipped };
  }

  private async walkLocal(dir: string, sink: Set<string>): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const e of entries) {
      if (e.name === '.meta' || e.name.startsWith('.')) continue;
      if (e.name.endsWith(STUB_EXT) || e.name.endsWith('.downloading') || e.name.endsWith('.part')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await this.walkLocal(full, sink);
      } else if (e.isFile()) {
        sink.add(path.normalize(full));
      }
    }
  }

  // ============================================
  // Status
  // ============================================

  async getStatus(project: string): Promise<{
    roots: SyncRoot[];
    entries: number;
    hydrated: number;
    pendingUploads: number;
    conflicts: number;
    deltaPolling: boolean;
    autoSync: boolean;
    recentConflicts: Array<{ localPath: string; timestamp: number; reason: string }>;
  }> {
    const m = await this.loadMapping(project);
    return {
      roots: m.roots,
      entries: Object.keys(m.entries).length,
      hydrated: Object.values(m.entries).filter(e => e.hydrated).length,
      pendingUploads: m.pendingUploads.length,
      conflicts: m.conflicts.length,
      deltaPolling: this.deltaTimers.has(project),
      autoSync: m.autoSync !== false,
      recentConflicts: m.conflicts.slice(-5),
    };
  }

  async getAutoSync(project: string): Promise<boolean> {
    const m = await this.loadMapping(project);
    return m.autoSync !== false;
  }

  async setAutoSync(project: string, enabled: boolean): Promise<void> {
    await this.withMapping(project, async (m) => {
      m.autoSync = enabled;
    });
  }
}
