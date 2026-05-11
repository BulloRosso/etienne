-- Dreaming pipeline job queue. SQLite + WAL.
-- One DB per project at <project>/.etienne/dreaming/queue.db.

CREATE TABLE IF NOT EXISTS jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,
  stage           TEXT NOT NULL,
  domain          TEXT,
  parent_id       INTEGER,
  payload         TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,
  error           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_locked  ON jobs(status, locked_until);
CREATE INDEX IF NOT EXISTS idx_jobs_parent         ON jobs(parent_id);
CREATE INDEX IF NOT EXISTS idx_jobs_run_stage      ON jobs(run_id, stage);

-- Persistent dream-run metadata: last_run_ts, history pointers.
CREATE TABLE IF NOT EXISTS run_state (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Buffered candidates that didn't pass G3 yet, available to next run.
CREATE TABLE IF NOT EXISTS buffered_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,
  domain          TEXT NOT NULL,
  candidate       TEXT NOT NULL,
  composite_score REAL,
  created_at      INTEGER NOT NULL
);
