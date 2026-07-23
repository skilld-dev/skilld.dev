-- Restore migration-led objects that are absent from the production schema.
-- This migration is intentionally idempotent so an intact database is unchanged.

-- Shape copied from 0011_install_events.sql.
CREATE TABLE IF NOT EXISTS install_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at INTEGER NOT NULL,
  surface TEXT NOT NULL,
  kind TEXT NOT NULL,
  owner TEXT,
  name TEXT,
  handle TEXT,
  slug TEXT
);

CREATE INDEX IF NOT EXISTS idx_install_events_recent ON install_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_install_events_skill ON install_events (kind, owner, name);
CREATE INDEX IF NOT EXISTS idx_install_events_collection ON install_events (kind, handle, slug);

-- Shape copied from 0015_skill_trust.sql.
CREATE INDEX IF NOT EXISTS idx_repo_trust_overrides_tier
  ON repo_trust_overrides (tier, reviewed_at DESC);

-- Runtime indexes required by installed nuxt-cf-jobs 0.14.0.
CREATE INDEX IF NOT EXISTS idx_jobs_dispatchable
  ON jobs(available_at)
  WHERE reserved_at IS NULL AND completed_at IS NULL AND failed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_stale_reserved
  ON jobs(reserved_at)
  WHERE reserved_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_failed_jobs_batch
  ON failed_jobs(batch_id);
