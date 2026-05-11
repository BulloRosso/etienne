import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { join } from 'path';
import { readFileSync } from 'fs';

export type JobStage =
  | 'harvest'
  | 'segment'
  | 'reflect'
  | 'distill'
  | 'ground'
  | 'consolidate'
  | 'promote'
  | 'index';

export type JobStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'buffered';

export interface Job {
  id: number;
  run_id: string;
  stage: JobStage;
  domain: string | null;
  parent_id: number | null;
  payload: any;
  status: JobStatus;
  attempts: number;
  locked_until: number | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface BufferedCandidate {
  id: number;
  run_id: string;
  domain: string;
  candidate: any;
  composite_score: number | null;
  created_at: number;
}

const SCHEMA_PATH = join(__dirname, 'schema.sql');

export class DreamingQueue {
  private db: Database.Database;

  constructor(public readonly dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    const schema = readFileSync(SCHEMA_PATH, 'utf8');
    this.db.exec(schema);
  }

  static async open(projectRoot: string): Promise<DreamingQueue> {
    const dir = join(projectRoot, '.etienne', 'dreaming');
    await fs.mkdir(dir, { recursive: true });
    return new DreamingQueue(join(dir, 'queue.db'));
  }

  close(): void {
    try { this.db.close(); } catch { /* already closed */ }
  }

  enqueue(stage: JobStage, payload: unknown, opts: { runId: string; domain?: string; parentId?: number } = { runId: '' }): number {
    const now = Date.now();
    const stmt = this.db.prepare(
      `INSERT INTO jobs (run_id, stage, domain, parent_id, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    );
    const result = stmt.run(opts.runId, stage, opts.domain ?? null, opts.parentId ?? null, JSON.stringify(payload ?? {}), now, now);
    return Number(result.lastInsertRowid);
  }

  /**
   * Atomically claim the oldest pending job whose lock has expired.
   * Returns null when there are no claimable jobs.
   */
  claimNext(lockSeconds = 300): Job | null {
    const now = Date.now();
    const lockUntil = now + lockSeconds * 1000;
    const select = this.db.prepare(
      `SELECT * FROM jobs
       WHERE status = 'pending'
         AND (locked_until IS NULL OR locked_until < ?)
       ORDER BY id ASC
       LIMIT 1`,
    );
    const update = this.db.prepare(
      `UPDATE jobs SET status = 'in_progress', locked_until = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'`,
    );
    const tx = this.db.transaction(() => {
      const row = select.get(now) as any;
      if (!row) return null;
      const result = update.run(lockUntil, now, row.id);
      if (result.changes === 0) return null;
      return this.hydrate({ ...row, status: 'in_progress', locked_until: lockUntil, attempts: row.attempts + 1, updated_at: now });
    });
    return tx();
  }

  complete(jobId: number): void {
    const now = Date.now();
    this.db.prepare(`UPDATE jobs SET status = 'completed', locked_until = NULL, updated_at = ? WHERE id = ?`).run(now, jobId);
  }

  fail(jobId: number, errorMsg: string, retryAfterSeconds: number | null = null): void {
    const now = Date.now();
    if (retryAfterSeconds === null) {
      this.db.prepare(`UPDATE jobs SET status = 'failed', error = ?, locked_until = NULL, updated_at = ? WHERE id = ?`).run(errorMsg, now, jobId);
    } else {
      this.db
        .prepare(`UPDATE jobs SET status = 'pending', error = ?, locked_until = ?, updated_at = ? WHERE id = ?`)
        .run(errorMsg, now + retryAfterSeconds * 1000, now, jobId);
    }
  }

  /** Release jobs whose locks expired without completion. Call on boot. */
  recoverStale(): number {
    const now = Date.now();
    const result = this.db
      .prepare(`UPDATE jobs SET status = 'pending', locked_until = NULL, updated_at = ? WHERE status = 'in_progress' AND (locked_until IS NULL OR locked_until < ?)`)
      .run(now, now);
    return result.changes ?? 0;
  }

  listByRun(runId: string): Job[] {
    const rows = this.db.prepare(`SELECT * FROM jobs WHERE run_id = ? ORDER BY id ASC`).all(runId) as any[];
    return rows.map((r) => this.hydrate(r));
  }

  countByStatus(): Record<JobStatus, number> {
    const rows = this.db.prepare(`SELECT status, COUNT(*) as count FROM jobs GROUP BY status`).all() as Array<{ status: JobStatus; count: number }>;
    const result: Record<JobStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      buffered: 0,
    };
    for (const r of rows) result[r.status] = r.count;
    return result;
  }

  getRunState(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM run_state WHERE key = ?`).get(key) as any;
    return row?.value ?? null;
  }

  setRunState(key: string, value: string): void {
    const now = Date.now();
    this.db
      .prepare(`INSERT INTO run_state (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(key, value, now);
  }

  bufferCandidate(runId: string, domain: string, candidate: unknown, compositeScore: number | null): void {
    const now = Date.now();
    this.db
      .prepare(`INSERT INTO buffered_candidates (run_id, domain, candidate, composite_score, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(runId, domain, JSON.stringify(candidate), compositeScore, now);
  }

  takeBufferedCandidates(domain?: string, limit = 100): BufferedCandidate[] {
    const rows = (domain
      ? this.db.prepare(`SELECT * FROM buffered_candidates WHERE domain = ? ORDER BY id ASC LIMIT ?`).all(domain, limit)
      : this.db.prepare(`SELECT * FROM buffered_candidates ORDER BY id ASC LIMIT ?`).all(limit)) as any[];
    return rows.map((r) => ({ ...r, candidate: JSON.parse(r.candidate) }));
  }

  removeBufferedCandidates(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM buffered_candidates WHERE id IN (${placeholders})`).run(...ids);
  }

  private hydrate(row: any): Job {
    return {
      id: row.id,
      run_id: row.run_id,
      stage: row.stage as JobStage,
      domain: row.domain,
      parent_id: row.parent_id,
      payload: row.payload ? JSON.parse(row.payload) : {},
      status: row.status as JobStatus,
      attempts: row.attempts,
      locked_until: row.locked_until,
      error: row.error,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
