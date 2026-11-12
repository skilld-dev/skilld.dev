-- A resumable position for a scheduled task that walks a table in rowid
-- order across many runs. The first user is `backfill-skill-sources`, which
-- copies every stored SKILL.md body to R2 (ADR-0019) a few hundred rows a
-- run, and must not reread the rows it has already copied.
CREATE TABLE IF NOT EXISTS registry_cursors (
  name TEXT PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
