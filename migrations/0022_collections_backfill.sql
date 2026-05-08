-- Phase 2: backfill collections_v2.author_user_id from the new users table,
-- drop the temporary author_login column, and recreate collections_v2 with the
-- FK + NOT NULL constraint. SQLite cannot ALTER a column to add FK / NOT NULL,
-- so we copy through a fresh table.
--
-- A harlanzw users row is inserted with github_id sentinel = -1 so the OAuth
-- handler can detect "ghost author seeded before login" and merge on first
-- sign-in (UPDATE users SET github_id = <real> WHERE login = 'harlanzw' AND
-- github_id < 0). Token columns stay NULL until OAuth populates them.

INSERT OR IGNORE INTO users (
  github_id, login, name, created_at, last_login_at
) VALUES (
  -1, 'harlanzw', 'Harlan Wilton',
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER)
);

UPDATE collections_v2
SET author_user_id = (SELECT id FROM users WHERE users.login = collections_v2.author_login)
WHERE author_user_id IS NULL;

CREATE TABLE collections_v2_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  preamble TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  featured_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (author_user_id, slug)
);

INSERT INTO collections_v2_new (
  id, author_user_id, slug, name, preamble, featured, featured_at,
  created_at, updated_at, deleted_at
)
SELECT id, author_user_id, slug, name, preamble, featured, featured_at,
       created_at, updated_at, deleted_at
FROM collections_v2
WHERE author_user_id IS NOT NULL;

DROP INDEX IF EXISTS idx_collections_v2_featured;
DROP INDEX IF EXISTS idx_collections_v2_author;
DROP TABLE collections_v2;
ALTER TABLE collections_v2_new RENAME TO collections_v2;

CREATE INDEX idx_collections_v2_featured
  ON collections_v2(featured, featured_at DESC)
  WHERE featured = 1 AND deleted_at IS NULL;
CREATE INDEX idx_collections_v2_author
  ON collections_v2(author_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
