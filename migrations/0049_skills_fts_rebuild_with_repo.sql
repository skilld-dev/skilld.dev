-- Rebuild `skills_fts` with `repo` as an indexed column.
--
-- After 0033 the identity of a skill row is `(owner, repo, name)`, but
-- `skills_fts` was still indexed on `(name, owner, display_name, slug)`. The
-- query in `querySkills` had to fall back to `(owner, name) IN (...)` which
-- returned both rows of a same-owner same-name collision (the
-- vercel-labs/agent-skills vs vercel-labs/openreview case). Adding `repo`
-- to the FTS columns lets the caller use a 3-tuple `(owner, repo, name) IN`
-- which is precise.
--
-- 119k-row rebuild is the heaviest single op in this migration sequence;
-- isolated to its own migration to stay under D1's per-migration budget.
DROP TRIGGER IF EXISTS skills_ai;
DROP TRIGGER IF EXISTS skills_ad;
DROP TRIGGER IF EXISTS skills_au;
DROP TABLE IF EXISTS skills_fts;

CREATE VIRTUAL TABLE skills_fts USING fts5(
  name, owner, repo, display_name, slug,
  content=skills, content_rowid=rowid
);

INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug)
  SELECT rowid, name, owner, repo, display_name, slug FROM skills;

CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug);
END;

CREATE TRIGGER skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug);
END;

CREATE TRIGGER skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug);
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug);
END;
