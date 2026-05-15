-- Bring dependent tables in line with the (owner, repo, name) keying that 0033
-- applied to `skills`. Each rebuild is small (skill_revisions ~thousands,
-- skill_generated and supported_skills smaller) so they fit comfortably in
-- a single migration's storage budget.

-- skill_revisions: PK (owner, name, sha) -> (owner, repo, name, sha)
CREATE TABLE skill_revisions_new (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  sha TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  author_login TEXT,
  message TEXT,
  PRIMARY KEY (owner, repo, name, sha)
);
INSERT INTO skill_revisions_new (owner, repo, name, sha, modified_at, author_login, message)
SELECT r.owner, s.repo, r.name, r.sha, r.modified_at, r.author_login, r.message
FROM skill_revisions r
JOIN skills s ON s.owner = r.owner AND s.name = r.name;
DROP TABLE skill_revisions;
ALTER TABLE skill_revisions_new RENAME TO skill_revisions;
CREATE INDEX idx_skill_revisions_lookup
  ON skill_revisions (owner, repo, name, modified_at DESC);

-- skill_generated: PK (owner, name, kind) -> (owner, repo, name, kind)
CREATE TABLE skill_generated_new (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sha TEXT NOT NULL,
  payload TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (owner, repo, name, kind)
);
INSERT INTO skill_generated_new (owner, repo, name, kind, sha, payload, generated_at)
SELECT g.owner, COALESCE(g.repo, s.repo), g.name, g.kind, g.sha, g.payload, g.generated_at
FROM skill_generated g
LEFT JOIN skills s ON s.owner = g.owner AND s.name = g.name
WHERE COALESCE(g.repo, s.repo) IS NOT NULL;
DROP TABLE skill_generated;
ALTER TABLE skill_generated_new RENAME TO skill_generated;

-- supported_skills: PK (owner, name) -> (owner, repo, name), repo now NOT NULL
CREATE TABLE supported_skills_new (
  owner        TEXT NOT NULL,
  repo         TEXT NOT NULL,
  name         TEXT NOT NULL,
  support_mode TEXT NOT NULL CHECK (support_mode IN ('include', 'exclude')),
  reason       TEXT NOT NULL,
  reviewed_by  TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo, name)
);
INSERT INTO supported_skills_new (owner, repo, name, support_mode, reason, reviewed_by, reviewed_at, notes, created_at, updated_at)
SELECT ss.owner, COALESCE(ss.repo, s.repo), ss.name, ss.support_mode, ss.reason, ss.reviewed_by, ss.reviewed_at, ss.notes, ss.created_at, ss.updated_at
FROM supported_skills ss
LEFT JOIN skills s ON s.owner = ss.owner AND s.name = ss.name
WHERE COALESCE(ss.repo, s.repo) IS NOT NULL;
DROP TABLE supported_skills;
ALTER TABLE supported_skills_new RENAME TO supported_skills;
CREATE INDEX idx_supported_skills_mode
  ON supported_skills (support_mode, owner, repo, name);

-- activity: add repo column + backfill + recreate the lookup index
ALTER TABLE activity ADD COLUMN repo TEXT;
UPDATE activity SET repo = (
  SELECT s.repo FROM skills s
  WHERE s.owner = activity.owner AND s.name = activity.name
  LIMIT 1
)
WHERE repo IS NULL;
DROP INDEX IF EXISTS idx_activity_skill;
CREATE INDEX idx_activity_skill ON activity (owner, repo, name);
