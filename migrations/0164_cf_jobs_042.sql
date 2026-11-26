-- Align durable jobs indexes with @harlan-zw/nuxt-cf-jobs 0.4.2.
--
-- Add partial index backing `findOrphanedBatches` and
-- `findUnrecoverableOrphanedBatches` (`finished_at IS NULL AND created_at <= ?
-- ORDER BY created_at ASC`) without scanning finished batches.
CREATE INDEX IF NOT EXISTS idx_job_batches_open_created
  ON job_batches(created_at)
  WHERE finished_at IS NULL;

PRAGMA optimize;
