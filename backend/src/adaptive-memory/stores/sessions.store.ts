import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { safeRoot } from '../../claude/utils/path.utils';
import type {
  SessionRecord,
  SessionTurn,
  StoreName,
} from '../../memory/types';

/**
 * SessionsStore — Adaptive Memory's view of a chat session.
 *
 * Builds atop the existing SessionsService chat history files
 * (`<project>/.etienne/chat.history-<sessionId>.jsonl`) by writing a sibling
 * snapshot record per session at
 * `<project>/.etienne/adaptive-memory/sessions/<sessionId>.snapshot.json`.
 *
 * The snapshot record carries:
 *   - workspaceSnapshotBefore / workspaceSnapshotAfter (git ref or content hash)
 *   - per-turn storeWrites accumulated during the within-task loop
 *   - activeSkills the agent ran with
 *   - qualityScore (filled by the Ponderer post-hoc)
 *
 * The legacy dreaming pipeline reads chat history files directly; this store
 * does not interfere with that path.
 */
@Injectable()
export class SessionsStore {
  private readonly logger = new Logger(SessionsStore.name);
  private readonly workspaceRoot =
    process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  // --- paths ---------------------------------------------------------------

  private projectRoot(project: string): string {
    return safeRoot(this.workspaceRoot, project);
  }

  private snapshotsDir(project: string): string {
    return join(this.projectRoot(project), '.etienne', 'adaptive-memory', 'sessions');
  }

  private snapshotPath(project: string, sessionId: string): string {
    return join(this.snapshotsDir(project), `${sessionId}.snapshot.json`);
  }

  // --- public API ----------------------------------------------------------

  /**
   * Open a new SessionRecord. Captures a workspace snapshot ref (git HEAD or
   * content-hash fallback) and persists the seed record. Returns the in-memory
   * SessionRecord — callers thread it through the within-task loop.
   */
  async open(
    project: string,
    sessionId: string,
    opts: { activeSkills: string[] },
  ): Promise<SessionRecord> {
    const dir = this.snapshotsDir(project);
    await fs.mkdir(dir, { recursive: true });
    const before = await this.captureSnapshot(this.projectRoot(project));
    const startedAt = new Date().toISOString();
    const record: SessionRecord = {
      id: sessionId,
      projectId: project,
      startedAt,
      endedAt: '', // filled by close()
      turns: [],
      activeSkills: opts.activeSkills,
      workspaceSnapshotBefore: before,
      workspaceSnapshotAfter: '',
    };
    await this.atomicWrite(this.snapshotPath(project, sessionId), record);
    return record;
  }

  /**
   * Close a SessionRecord. Captures the after-snapshot and persists. Idempotent:
   * if the record has already been closed (endedAt non-empty), this is a no-op.
   */
  async close(project: string, record: SessionRecord): Promise<SessionRecord> {
    if (record.endedAt) return record;
    record.endedAt = new Date().toISOString();
    record.workspaceSnapshotAfter = await this.captureSnapshot(this.projectRoot(project));
    await this.atomicWrite(this.snapshotPath(project, record.id), record);
    return record;
  }

  /**
   * Append a turn to an open session. Persisted on every call so a process
   * crash doesn't lose history. (Volume is low — one record per chat turn.)
   */
  async appendTurn(
    project: string,
    record: SessionRecord,
    turn: SessionTurn,
  ): Promise<void> {
    record.turns.push(turn);
    await this.atomicWrite(this.snapshotPath(project, record.id), record);
  }

  /**
   * Convenience used by writeback tools: append a `{store, entryId}` record
   * to the most-recent turn's `storeWrites`. The Adaptive-Memory agent runs
   * each tool call within a turn, so the last turn is always the right target.
   */
  async recordWrite(
    project: string,
    record: SessionRecord,
    store: StoreName,
    entryId: string,
  ): Promise<void> {
    const last = record.turns[record.turns.length - 1];
    if (!last) {
      this.logger.warn(
        `recordWrite called on session ${record.id} with no turns; ignoring`,
      );
      return;
    }
    last.storeWrites.push({ store, entryId });
    await this.atomicWrite(this.snapshotPath(project, record.id), record);
  }

  /** Read an existing snapshot record (returns null when absent). */
  async read(project: string, sessionId: string): Promise<SessionRecord | null> {
    const path = this.snapshotPath(project, sessionId);
    if (!existsSync(path)) return null;
    try {
      const raw = await fs.readFile(path, 'utf8');
      return JSON.parse(raw) as SessionRecord;
    } catch (err: any) {
      this.logger.warn(`Could not read session snapshot ${sessionId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Update qualityScore on an existing snapshot. Used by the Ponderer's
   * quality-scoring stage; safe to call on a closed session.
   */
  async setQualityScore(
    project: string,
    sessionId: string,
    score: number,
  ): Promise<void> {
    const record = await this.read(project, sessionId);
    if (!record) return;
    record.qualityScore = score;
    await this.atomicWrite(this.snapshotPath(project, sessionId), record);
  }

  /**
   * List sessions the Ponderer has not yet processed (qualityScore === undefined).
   * The Ponderer uses this to decide which sessions to score this cycle.
   */
  async unprocessed(project: string): Promise<SessionRecord[]> {
    const dir = this.snapshotsDir(project);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out: SessionRecord[] = [];
    for (const name of entries) {
      if (!name.endsWith('.snapshot.json')) continue;
      try {
        const raw = await fs.readFile(join(dir, name), 'utf8');
        const rec = JSON.parse(raw) as SessionRecord;
        if (rec.qualityScore === undefined && rec.endedAt) out.push(rec);
      } catch {
        /* skip */
      }
    }
    return out;
  }

  // --- helpers -------------------------------------------------------------

  /**
   * Capture a workspace snapshot reference. Tries `git rev-parse HEAD`; falls
   * back to a content hash placeholder when the project is not a git repo.
   *
   * The placeholder format `nogit:<iso-timestamp>` is intentionally distinct
   * so consumers can tell git-tracked from untracked workspaces.
   */
  private async captureSnapshot(cwd: string): Promise<string> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const child = spawn('git', ['rev-parse', 'HEAD'], {
        cwd,
        shell: isWin,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.on('error', () => resolve(`nogit:${new Date().toISOString()}`));
      child.on('close', (code) => {
        if (code === 0 && stdout.trim()) resolve(stdout.trim());
        else resolve(`nogit:${new Date().toISOString()}`);
      });
    });
  }

  private async atomicWrite(path: string, value: unknown): Promise<void> {
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, path);
  }
}
