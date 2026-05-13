import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { GraphClientService, DriveItem } from './graph-client.service';

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
  private readonly DELTA_INTERVAL_MS = Number(process.env.MS365_DELTA_INTERVAL_MS || 5 * 60 * 1000);

  constructor(private readonly graph: GraphClientService) {}

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
      return JSON.parse(raw) as ProjectMapping;
    } catch {
      return { version: 1, roots: [], deltaTokens: {}, entries: {}, pendingUploads: [], conflicts: [] };
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

  async removeRoot(project: string, label: string): Promise<void> {
    await this.withMapping(project, async (m) => {
      m.roots = m.roots.filter(r => r.label !== label);
      delete m.deltaTokens[label];
    });
  }

  // ============================================
  // Stub creation: materialize tree structure as empty files
  // ============================================

  async stubTree(project: string, rootLabel?: string): Promise<{ stubs: number; folders: number }> {
    const mapping = await this.loadMapping(project);
    const excludes = await this.loadExcludes(project);
    const roots = rootLabel ? mapping.roots.filter(r => r.label === rootLabel) : mapping.roots;
    let stubs = 0, folders = 0;

    for (const root of roots) {
      const walk = async (remotePath: string, localDir: string): Promise<void> => {
        const children = await this.graph.getChildrenByPath(project, remotePath, root.driveId);
        await fs.mkdir(localDir, { recursive: true });
        for (const child of children) {
          if (!child.name || matchesExclude(child.name, excludes)) continue;
          const childRemote = remotePath ? `${remotePath}/${child.name}` : child.name;
          const childLocal = path.join(localDir, child.name);
          if (child.folder) {
            folders++;
            await this.recordEntry(project, child, childRemote, root.driveId, false);
            await walk(childRemote, childLocal);
          } else if (child.file) {
            if (child.size && excludes.maxSize && child.size > excludes.maxSize) continue;
            const stubPath = childLocal + STUB_EXT;
            await fs.writeFile(stubPath, JSON.stringify({
              driveItemId: child.id,
              driveId: root.driveId,
              remotePath: childRemote,
              size: child.size,
              eTag: child.eTag,
              hydrate: `Call mcp__ms365-bridge__hydrate_path with path "${childRemote}" to fetch content.`,
            }, null, 2));
            stubs++;
            await this.recordEntry(project, child, childRemote, root.driveId, false);
          }
        }
      };
      try {
        await walk(root.remotePath, root.localRoot);
      } catch (err: any) {
        this.logger.error(`stubTree failed for root ${root.label}: ${err.message}`);
      }
    }
    return { stubs, folders };
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
    await fs.writeFile(localPath, buf);
    try { await fs.unlink(stubPath); } catch { /* no stub */ }

    await this.withMapping(project, async (m) => {
      if (m.entries[remotePath]) {
        m.entries[remotePath].hydrated = true;
        m.entries[remotePath].lastSync = Date.now();
      }
    });
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

  async runDelta(project: string): Promise<{ changed: number }> {
    const mapping = await this.loadMapping(project);
    let changed = 0;
    for (const root of mapping.roots) {
      const prevToken = mapping.deltaTokens[root.label];
      try {
        let token: string | undefined = prevToken;
        let cursor: string | undefined = prevToken;
        do {
          const { items, nextLink, deltaLink } = await this.graph.getDelta(project, cursor, root.driveId);
          for (const item of items) {
            if (!item.name) continue;
            const parentPath = item.parentReference?.path?.replace(/^\/drive\/root:?\/?/, '') || '';
            const remotePath = parentPath ? `${parentPath}/${item.name}` : item.name;
            if (!remotePath.startsWith(root.remotePath)) continue;
            changed++;
            // Update mapping entry; do not auto-hydrate.
            await this.recordEntry(project, item, remotePath, root.driveId, mapping.entries[remotePath]?.hydrated || false);
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
        this.logger.error(`delta for root ${root.label} failed: ${err.message}`);
      }
    }
    return { changed };
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
      recentConflicts: m.conflicts.slice(-5),
    };
  }
}
