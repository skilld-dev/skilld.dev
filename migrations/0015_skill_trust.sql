ALTER TABLE skills ADD COLUMN trust_tier TEXT NOT NULL DEFAULT 'untrusted';
ALTER TABLE skills ADD COLUMN trust_source TEXT NOT NULL DEFAULT 'computed';
ALTER TABLE skills ADD COLUMN trust_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN trust_reasons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE skills ADD COLUMN trust_synced_at INTEGER;
ALTER TABLE skills ADD COLUMN repo_skill_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS repo_trust_overrides (
  owner        TEXT NOT NULL,
  repo         TEXT NOT NULL,
  tier         TEXT NOT NULL CHECK (tier IN (
    'official',
    'trusted-author',
    'trusted-curator',
    'candidate',
    'untrusted',
    'quarantined'
  )),
  source       TEXT NOT NULL DEFAULT 'manual',
  reason       TEXT NOT NULL,
  reviewed_by  TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_skills_trust_tier
  ON skills (trust_tier, trust_score DESC, installs DESC);

CREATE INDEX IF NOT EXISTS idx_skills_repo_skill_count
  ON skills (repo_skill_count DESC, installs DESC);

CREATE INDEX IF NOT EXISTS idx_repo_trust_overrides_tier
  ON repo_trust_overrides (tier, reviewed_at DESC);
