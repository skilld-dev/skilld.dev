-- D1 index of public dev.skilld.collection records.
-- Source of truth remains the curator's PDS; this is a denormalized projection.
-- Sync writer: server/utils/atproto/collection-sync.ts (called by refresh-curators task).
-- PRIVACY: dev.skilld.collection.save records MUST NEVER enter this index. See
-- scripts/check-saves-isolation.ts for the mechanical guard.

CREATE TABLE IF NOT EXISTS collections (
  uri          TEXT PRIMARY KEY,
  did          TEXT NOT NULL,
  rkey         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  preamble     TEXT,
  stacks       TEXT NOT NULL DEFAULT '[]',
  post_uri     TEXT,
  post_cid     TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  indexed_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_collections_did_updated ON collections (did, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_updated     ON collections (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_alive       ON collections (deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS collection_skills (
  collection_uri TEXT NOT NULL,
  position       INTEGER NOT NULL,
  package_name   TEXT NOT NULL,
  owner          TEXT,
  repo           TEXT,
  reason         TEXT,
  PRIMARY KEY (collection_uri, position),
  FOREIGN KEY (collection_uri) REFERENCES collections(uri) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_skills_lookup ON collection_skills (package_name, owner, repo);
