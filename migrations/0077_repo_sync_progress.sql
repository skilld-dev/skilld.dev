CREATE TABLE IF NOT EXISTS repo_sync_progress (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE,
  tree_sha TEXT,
  checked_at INTEGER NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 0 CHECK (next_offset >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_repo_sync_progress_updated
  ON repo_sync_progress (updated_at);
