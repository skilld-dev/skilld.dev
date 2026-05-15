-- sync_jobs registry. One row per scheduled task; tasks call reportJobRun()
-- on completion to update last_run_at / status / duration. Rows are
-- self-registered (INSERT OR IGNORE on first call) so newly-added tasks
-- don't need an explicit seed step, but we pre-seed the currently-registered
-- jobs so /admin/integrity has rows to display before the first cron fires.
CREATE TABLE IF NOT EXISTS sync_jobs (
  name TEXT PRIMARY KEY,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  stale_after_seconds INTEGER,
  last_run_at INTEGER,
  last_status TEXT, -- 'ok' | 'error' | 'partial'
  last_error TEXT,
  last_duration_ms INTEGER,
  run_count INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sync_jobs (name, cron, enabled) VALUES
  ('sync-github-skills', '0 * * * *', 1),
  ('send-digests',       '0 * * * *', 1),
  ('reconcile-rendered', '0 * * * *', 1);
