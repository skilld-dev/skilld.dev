CREATE TABLE IF NOT EXISTS owners (
  owner TEXT PRIMARY KEY,
  kind TEXT,
  name TEXT,
  bio TEXT,
  blog TEXT,
  location TEXT,
  followers INTEGER NOT NULL DEFAULT 0,
  public_repos INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER,
  sync_status TEXT
);

CREATE INDEX IF NOT EXISTS idx_owners_followers ON owners (followers DESC);
