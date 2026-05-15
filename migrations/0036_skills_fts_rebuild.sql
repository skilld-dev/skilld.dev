-- FTS rebuild on 119k rows is the heaviest single op in the 0033 reorg.
-- Isolated to its own migration so it stays under D1's per-migration time
-- budget (~30s for one storage object operation).
--
-- Idempotent re-entry: if a partial drop happened in a prior failure, the
-- DROPs are conditional. Triggers are recreated unconditionally — wrangler
-- only re-applies migrations that haven't been recorded as successful.
DROP TRIGGER IF EXISTS skills_ai;
DROP TRIGGER IF EXISTS skills_ad;
DROP TRIGGER IF EXISTS skills_au;
DROP TABLE IF EXISTS skills_fts;

CREATE VIRTUAL TABLE skills_fts USING fts5(
  name, owner, display_name, slug,
  content=skills, content_rowid=rowid
);

INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  SELECT rowid, name, owner, display_name, slug FROM skills;

CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.display_name, new.slug);
END;

CREATE TRIGGER skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.display_name, old.slug);
END;

CREATE TRIGGER skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.display_name, old.slug);
  INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.display_name, new.slug);
END;
