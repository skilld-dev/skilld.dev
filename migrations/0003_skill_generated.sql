-- Unified storage for batch-generated derived content: FAQs, tags, embeddings, etc.
-- `kind` discriminates the payload shape. `sha` ties regeneration to SKILL.md content.
CREATE TABLE IF NOT EXISTS skill_generated (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sha TEXT NOT NULL,
  payload TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (owner, name, kind)
);

CREATE INDEX IF NOT EXISTS idx_skill_generated_kind ON skill_generated (kind);
CREATE INDEX IF NOT EXISTS idx_skill_generated_sha ON skill_generated (kind, sha);
