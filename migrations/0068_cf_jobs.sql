-- Durable job storage owned by nuxt-cf-jobs 0.13.x. These tables are
-- intentionally created before queue consumers and reconciliation are enabled,
-- so deploying the runtime can never race an absent schema.
CREATE TABLE IF NOT EXISTS job_batches (
  id TEXT PRIMARY KEY,
  name TEXT,
  parent_batch_id TEXT,
  total_jobs INTEGER NOT NULL DEFAULT 0,
  pending_jobs INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0,
  on_finish TEXT,
  handler TEXT,
  allow_failures INTEGER DEFAULT 0,
  site_id TEXT,
  user_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  queue TEXT NOT NULL,
  job_type TEXT NOT NULL,
  batch_id TEXT REFERENCES job_batches(id),
  user_id INTEGER,
  site_id TEXT,
  partner_id TEXT,
  trace_id TEXT,
  unique_key TEXT,
  payload TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  reserved_at INTEGER,
  available_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  failed_at INTEGER,
  last_error TEXT,
  retry_reasons TEXT,
  rows_fetched INTEGER,
  rows_inserted INTEGER,
  d1_rows_read INTEGER,
  d1_rows_written INTEGER,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS failed_jobs (
  id TEXT PRIMARY KEY,
  queue TEXT NOT NULL,
  job_type TEXT NOT NULL,
  batch_id TEXT,
  user_id INTEGER,
  site_id TEXT,
  partner_id TEXT,
  trace_id TEXT,
  unique_key TEXT,
  payload TEXT NOT NULL,
  exception TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  failed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_batches_site ON job_batches(site_id);
CREATE INDEX IF NOT EXISTS idx_job_batches_pending ON job_batches(pending_jobs);
CREATE INDEX IF NOT EXISTS idx_job_batches_parent ON job_batches(parent_batch_id);
CREATE INDEX IF NOT EXISTS idx_job_batches_finished_at ON job_batches(finished_at);
CREATE INDEX IF NOT EXISTS idx_jobs_claimable ON jobs(queue, reserved_at, available_at);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_site ON jobs(site_id);
CREATE INDEX IF NOT EXISTS idx_jobs_partner ON jobs(partner_id);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_batch ON jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_jobs_trace ON jobs(trace_id);
CREATE INDEX IF NOT EXISTS idx_jobs_sync_dedup ON jobs(site_id, job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON jobs(completed_at)
  WHERE completed_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique_active ON jobs(unique_key)
  WHERE unique_key IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_failed_jobs_queue ON failed_jobs(queue);
CREATE INDEX IF NOT EXISTS idx_failed_jobs_site ON failed_jobs(site_id);
CREATE INDEX IF NOT EXISTS idx_failed_jobs_trace ON failed_jobs(trace_id);
CREATE INDEX IF NOT EXISTS idx_failed_jobs_failed_at ON failed_jobs(failed_at);
