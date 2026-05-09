-- Manual overrides for repo_kind. Count-based classification misclassifies
-- prolific single-author repos (e.g. mattpocock/skills, 22 skills, is still a
-- creator). Same pattern as repo_trust_overrides.
CREATE TABLE IF NOT EXISTS repo_kind_overrides (
  owner       TEXT NOT NULL,
  repo        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('creator', 'catalog', 'aggregator')),
  reason      TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo)
);

-- Track whether the value on skills came from the count heuristic or an
-- override, mirroring trust_source on the same table.
ALTER TABLE skills ADD COLUMN repo_kind_source TEXT NOT NULL DEFAULT 'computed'
  CHECK (repo_kind_source IN ('computed', 'override'));

-- Initial overrides: prolific single-author skill packs that should keep
-- creator semantics for Loop 1 ranking.
INSERT INTO repo_kind_overrides (owner, repo, kind, reason, reviewed_by) VALUES
  ('mattpocock', 'skills', 'creator', 'single-author skill pack; 22 skills but one maintainer', 'harlan');

-- Apply overrides to skills.
UPDATE skills
SET repo_kind = o.kind, repo_kind_source = 'override'
FROM repo_kind_overrides AS o
WHERE skills.owner = o.owner AND skills.repo = o.repo;
