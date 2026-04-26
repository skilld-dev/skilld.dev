-- Per-skill commit history. Powers the Receipts panel "history" surface
-- and lays groundwork for E5 Skill Passport without UI commitment.
-- Keys mirror skills(owner, name) so existing rows compose without joins.
CREATE TABLE IF NOT EXISTS skill_revisions (
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  sha TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  author_login TEXT,
  message TEXT,
  PRIMARY KEY (owner, name, sha)
);

CREATE INDEX IF NOT EXISTS idx_skill_revisions_lookup
  ON skill_revisions (owner, name, modified_at DESC);
