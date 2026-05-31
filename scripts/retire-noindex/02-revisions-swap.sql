-- Keep only revisions whose skill survived (now all of skills is indexable).
-- Run AFTER 01-skills-swap.sql.
CREATE TABLE "skill_revisions_new" (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  sha TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  author_login TEXT,
  message TEXT,
  PRIMARY KEY (owner, repo, name, sha)
);
INSERT INTO skill_revisions_new
  SELECT * FROM skill_revisions r
  WHERE EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo AND s.name = r.name);
DROP TABLE skill_revisions;
ALTER TABLE skill_revisions_new RENAME TO skill_revisions;
CREATE INDEX idx_skill_revisions_lookup ON skill_revisions (owner, repo, name, modified_at DESC);
