ALTER TABLE skills ADD COLUMN is_official INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN source_resolved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN curator_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN curator_reason_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN approved_social_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN author_social_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN seo_index_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN seo_indexable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN seo_index_reasons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE skills ADD COLUMN seo_index_synced_at INTEGER;
ALTER TABLE skills ADD COLUMN trust_tier TEXT NOT NULL DEFAULT 'untrusted';
ALTER TABLE skills ADD COLUMN trust_source TEXT NOT NULL DEFAULT 'computed';
ALTER TABLE skills ADD COLUMN trust_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN trust_reasons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE skills ADD COLUMN trust_synced_at INTEGER;
ALTER TABLE skills ADD COLUMN repo_skill_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS repo_trust_overrides (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('official', 'trusted-author', 'trusted-curator', 'candidate', 'untrusted', 'quarantined')),
  source TEXT NOT NULL DEFAULT 'manual',
  reason TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_skills_seo_indexable
  ON skills (seo_indexable, trust_tier, seo_index_score DESC, installs DESC);

CREATE INDEX IF NOT EXISTS idx_skills_official
  ON skills (is_official, installs DESC);

CREATE INDEX IF NOT EXISTS idx_skills_trust_tier
  ON skills (trust_tier, trust_source, installs DESC);
