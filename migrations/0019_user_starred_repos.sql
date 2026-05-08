-- Phase 2: cache of user's GitHub stars. Populated on first OAuth + manual re-sync.
-- has_skill is set at sync time by joining against the skills table.
CREATE TABLE user_starred_repos (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  starred_at INTEGER NOT NULL,
  has_skill INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, owner, repo)
);
CREATE INDEX idx_starred_user_haskill ON user_starred_repos(user_id, has_skill, starred_at DESC);
