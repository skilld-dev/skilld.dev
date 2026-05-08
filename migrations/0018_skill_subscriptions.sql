-- Phase 2: per-repo subscriptions. A repo with multiple skills folds into a
-- single digest entry. `source` records how the subscription came in:
--   'star-import' | 'manual' | 'collection:<slug>'
CREATE TABLE skill_subscriptions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL,
  muted_until INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, owner, repo)
);
CREATE INDEX idx_subs_user ON skill_subscriptions(user_id, created_at DESC);
CREATE INDEX idx_subs_repo ON skill_subscriptions(owner, repo);
