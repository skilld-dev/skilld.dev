-- Phase 1: collections v2 with placeholder author_login.
-- author_user_id is NULL until Phase 2 adds the users table; FK constraint
-- and NOT NULL get applied in a later migration after backfill.
CREATE TABLE collections_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_user_id INTEGER,
  author_login TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  preamble TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  featured_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (author_login, slug)
);
CREATE INDEX idx_collections_v2_featured
  ON collections_v2(featured, featured_at DESC)
  WHERE featured=1 AND deleted_at IS NULL;
CREATE INDEX idx_collections_v2_author
  ON collections_v2(author_login, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE collection_skills_v2 (
  collection_id INTEGER NOT NULL REFERENCES collections_v2(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY (collection_id, position)
);
CREATE INDEX idx_collection_skills_v2_repo ON collection_skills_v2(owner, repo);
