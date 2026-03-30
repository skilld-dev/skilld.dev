CREATE TABLE IF NOT EXISTS skills (
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  display_name TEXT NOT NULL,
  installs INTEGER NOT NULL DEFAULT 0,
  slug TEXT NOT NULL,
  PRIMARY KEY (owner, name)
);

CREATE INDEX IF NOT EXISTS idx_skills_installs ON skills (installs DESC);
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills (owner);

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name,
  owner,
  display_name,
  slug,
  content=skills,
  content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.display_name, new.slug);
END;

CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.display_name, old.slug);
END;

CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.display_name, old.slug);
  INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.display_name, new.slug);
END;
