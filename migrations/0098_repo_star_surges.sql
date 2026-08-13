-- Detected jumps in a tracked repo's star count.
--
-- `repo_star_observations` already records a daily total during metadata sync.
-- This table records the days a detector judged unusual, so a surge can be
-- surfaced, notified once, and reviewed later without recomputing the whole
-- series on every read.
--
-- One row per repo per day: the detector runs daily and is idempotent, so a
-- re-run updates the day's verdict rather than duplicating it.
CREATE TABLE repo_star_surges (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  observed_day INTEGER NOT NULL CHECK (observed_day >= 0 AND observed_day % 86400 = 0),
  -- Stars gained per day across the latest interval, gap-adjusted.
  latest_gain INTEGER NOT NULL,
  -- The repo's median daily gain over the baseline window, for comparison.
  baseline_gain INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  detected_at INTEGER NOT NULL,
  -- Set once a notification has gone out, so a multi-day surge is announced
  -- on the day it starts and not once per day for a week.
  announced_at INTEGER,
  PRIMARY KEY (owner, repo, observed_day),
  FOREIGN KEY (owner, repo) REFERENCES repos(owner, repo) ON DELETE CASCADE
);

-- The "what is climbing right now" read, and the notifier's pending query.
CREATE INDEX idx_repo_star_surges_recent
  ON repo_star_surges (observed_day DESC, latest_gain DESC);
