-- Upgrade durable jobs from nuxt-cf-jobs 0.14.5 to 0.16.0.
-- Existing rows predate the transactional publication outbox, so mark them as
-- already published before adding the unpublished-only recovery index.
ALTER TABLE jobs ADD COLUMN backoff TEXT;
ALTER TABLE jobs ADD COLUMN published_at INTEGER;
ALTER TABLE jobs ADD COLUMN last_dispatched_at INTEGER;
ALTER TABLE jobs ADD COLUMN dispatch_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN last_dispatch_error TEXT;

UPDATE jobs
SET published_at = created_at,
    last_dispatched_at = created_at,
    dispatch_attempts = 1
WHERE published_at IS NULL;

DROP INDEX IF EXISTS idx_job_batches_pending;
DROP INDEX IF EXISTS idx_jobs_claimable;
DROP INDEX IF EXISTS idx_jobs_trace;
DROP INDEX IF EXISTS idx_failed_jobs_trace;
DROP INDEX IF EXISTS idx_failed_jobs_site;
DROP INDEX IF EXISTS idx_failed_jobs_batch;
DROP INDEX IF EXISTS idx_jobs_dispatchable;

CREATE INDEX idx_jobs_dispatchable
  ON jobs(available_at)
  WHERE published_at IS NULL
    AND reserved_at IS NULL
    AND completed_at IS NULL
    AND failed_at IS NULL;

CREATE INDEX idx_jobs_active
  ON jobs(created_at)
  WHERE completed_at IS NULL AND failed_at IS NULL;

CREATE INDEX idx_failed_jobs_site_failed_at
  ON failed_jobs(site_id, failed_at);

CREATE INDEX idx_failed_jobs_batch_failed_at
  ON failed_jobs(batch_id, failed_at);

PRAGMA optimize;
