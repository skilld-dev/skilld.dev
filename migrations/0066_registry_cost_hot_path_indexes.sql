-- Registry API lookups resolve batches of skill names. The previous indexes
-- all led with owner or a ranking field, so each request scanned a large share
-- of the skills table before applying `name IN (...)`.
CREATE INDEX IF NOT EXISTS idx_skills_name_lookup
  ON skills(name, owner, repo);

-- The hourly GitHub refresh now selects only repos whose successful metadata
-- check is due. Keep broken repos out of the index and make due-order reads a
-- narrow index walk instead of a scan of the whole repos table.
CREATE INDEX IF NOT EXISTS idx_repos_sync_due
  ON repos(repo_meta_synced_at, owner, repo)
  WHERE broken_since IS NULL;
