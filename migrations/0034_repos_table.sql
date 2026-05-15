-- Extract repo facts onto a dedicated `repos` table.
--
-- We DON'T drop the now-duplicated columns from `skills` in this migration:
-- the 11 ALTER TABLE DROP COLUMN ops in a single transaction OOM'd D1
-- (each one internally rewrites the column data on a 119k-row table, and
-- the storage budget can't hold the intermediate state). Stale columns are
-- harmless because:
--   - Reads go through the `skills_v` view (0035), which pulls repo facts
--     from `repos`, never from the stale columns on `skills`.
--   - Writes from `sync-repo.ts` no longer touch those columns on `skills`
--     (only the new INSERT shape, no moved cols).
-- The cleanup of the stale columns can land later as a series of tiny
-- one-column-per-migration drops.

CREATE TABLE repos (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  pushed_at INTEGER,
  repo_created_at INTEGER,
  repo_meta_synced_at INTEGER,
  last_tree_sha TEXT,
  repo_kind TEXT NOT NULL DEFAULT 'creator'
    CHECK (repo_kind IN ('creator', 'catalog', 'aggregator')),
  repo_kind_source TEXT NOT NULL DEFAULT 'computed'
    CHECK (repo_kind_source IN ('computed', 'override')),
  repo_skill_count INTEGER NOT NULL DEFAULT 0,
  broken_since INTEGER,
  PRIMARY KEY (owner, repo)
);

-- Pure-aggregate backfill. MAX() across strings is deterministic; sync
-- overwrites with the authoritative value on the next pass anyway, so the
-- "latest by last_synced_at" precision isn't worth the correlated-subquery
-- memory cost (which OOM'd D1 on 119k rows).
INSERT INTO repos (
  owner, repo, default_branch, stars, forks, pushed_at, repo_created_at,
  repo_meta_synced_at, last_tree_sha, repo_kind, repo_kind_source,
  repo_skill_count, broken_since
)
SELECT
  owner,
  repo,
  MAX(default_branch),
  COALESCE(MAX(stars), 0),
  COALESCE(MAX(forks), 0),
  MAX(pushed_at),
  MIN(repo_created_at),
  MAX(repo_meta_synced_at),
  MAX(last_tree_sha),
  COALESCE(MAX(repo_kind), 'creator'),
  COALESCE(MAX(repo_kind_source), 'computed'),
  COALESCE(MAX(repo_skill_count), 0),
  MIN(broken_since)
FROM skills
GROUP BY owner, repo;

CREATE INDEX repos_stars_idx ON repos (stars DESC);
CREATE INDEX repos_pushed_at_idx ON repos (pushed_at DESC);
CREATE INDEX repos_broken_idx ON repos (broken_since);
CREATE INDEX repos_kind_idx ON repos (repo_kind);
