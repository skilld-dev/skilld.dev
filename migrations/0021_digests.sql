-- Phase 3: digest send log. One row per scheduled window per user.
-- change_count == 0 windows still get a row with status='skipped' so the
-- "next window" cursor is just MAX(window_end).
CREATE TABLE digest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  change_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','skipped','failed')),
  resend_id TEXT,
  ai_summary_used INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  error TEXT
);
CREATE UNIQUE INDEX idx_digest_window ON digest_runs(user_id, window_end);
CREATE INDEX idx_digest_status ON digest_runs(status, window_end DESC);
