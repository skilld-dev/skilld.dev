-- Align durable jobs indexes with @harlan-zw/nuxt-cf-jobs 0.4.1.
--
-- Drop redundant and unused `jobs` indexes to reduce D1 write amplification:
-- - `idx_jobs_site` duplicates the leading column of `idx_jobs_sync_dedup (site_id, job_type)`.
-- - `idx_jobs_user` and `idx_jobs_partner` index optional tenant metadata with no reader.
--
-- Narrow nullable-column indexes to partial `IS NOT NULL` predicates so rows
-- without a site or batch skip secondary index writes.
DROP INDEX IF EXISTS idx_jobs_site;
DROP INDEX IF EXISTS idx_jobs_user;
DROP INDEX IF EXISTS idx_jobs_partner;

DROP INDEX IF EXISTS idx_job_batches_site;
DROP INDEX IF EXISTS idx_jobs_batch;
DROP INDEX IF EXISTS idx_jobs_sync_dedup;

CREATE INDEX idx_job_batches_site
  ON job_batches(site_id)
  WHERE site_id IS NOT NULL;

CREATE INDEX idx_jobs_batch
  ON jobs(batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX idx_jobs_sync_dedup
  ON jobs(site_id, job_type)
  WHERE site_id IS NOT NULL;

PRAGMA optimize;
