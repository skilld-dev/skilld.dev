-- The weekly email: liked-skill changes plus what trended.
--
-- Opt-out, not opt-in. Every account with a deliverable address gets it until
-- that person turns it off, so the column defaults to 0 and the send query
-- reads `weekly_opt_out = 0`. Kept separate from `email_opt_in`, which governs
-- the older watched-repo digest: unsubscribing from one must not silently
-- cancel the other.
ALTER TABLE users ADD COLUMN weekly_opt_out INTEGER NOT NULL DEFAULT 0;

-- One row per recipient per week, claimed before the send.
--
-- The cron fires hourly and Cloudflare may replay a trigger, so without a
-- claim a replay is a second copy of the same email. `window_end` identifies
-- the week, and the unique index is what makes the claim atomic: the second
-- insert loses rather than both proceeding.
CREATE TABLE weekly_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  liked_count INTEGER NOT NULL DEFAULT 0,
  trending_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('claimed','sent','skipped','failed','uncertain')),
  provider_message_id TEXT,
  claimed_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT
);

CREATE UNIQUE INDEX weekly_runs_user_window ON weekly_runs (user_id, window_end);
