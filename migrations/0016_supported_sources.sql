CREATE TABLE IF NOT EXISTS supported_repos (
  owner        TEXT NOT NULL,
  repo         TEXT NOT NULL,
  support_tier TEXT NOT NULL CHECK (support_tier IN (
    'core-official',
    'trusted-author',
    'curated',
    'candidate'
  )),
  enabled      INTEGER NOT NULL DEFAULT 1,
  reason       TEXT NOT NULL,
  reviewed_by  TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_supported_repos_enabled
  ON supported_repos (enabled, support_tier, owner, repo);

CREATE TABLE IF NOT EXISTS supported_skills (
  owner        TEXT NOT NULL,
  name         TEXT NOT NULL,
  repo         TEXT,
  support_mode TEXT NOT NULL CHECK (support_mode IN ('include', 'exclude')),
  reason       TEXT NOT NULL,
  reviewed_by  TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, name)
);

CREATE INDEX IF NOT EXISTS idx_supported_skills_mode
  ON supported_skills (support_mode, owner, name);
