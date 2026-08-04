-- Rebuild `skills_fts` with `description` as an indexed column.
--
-- The lexical lane could only ever match identifiers: name, owner, repo,
-- display_name, slug. Both search placeholders on the site invite task-shaped
-- queries ("Try 'debug a flaky test'"), and none of those words appear in an
-- identifier, so FTS returned nothing and search leaned entirely on the
-- semantic lane. That lane in turn misses the ~300 indexable skills whose
-- vectors have not been generated yet, making them unreachable by any query.
--
-- Indexing `description` gives the fused retriever a real lexical signal for
-- prose queries and a fallback path for skills with no vector.
--
-- `INSERT INTO skills_fts(skills_fts) VALUES('rebuild')` repopulates the index
-- from the `skills` content table in one pass, so no explicit backfill is
-- needed. This is the heaviest op here; it is isolated in its own migration
-- to stay under D1's per-migration budget (same reasoning as 0049).
DROP TRIGGER IF EXISTS skills_ai;
DROP TRIGGER IF EXISTS skills_ad;
DROP TRIGGER IF EXISTS skills_au;
DROP TABLE IF EXISTS skills_fts;

CREATE VIRTUAL TABLE skills_fts USING fts5(
  name, owner, repo, display_name, slug, description,
  content=skills, content_rowid=rowid
);

INSERT INTO skills_fts(skills_fts) VALUES('rebuild');

CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug, description)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug, new.description);
END;

CREATE TRIGGER skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug, description)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug, old.description);
END;

CREATE TRIGGER skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug, description)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug, old.description);
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug, description)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug, new.description);
END;
