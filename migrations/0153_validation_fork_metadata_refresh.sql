-- Prioritize confirmation of unknown fork metadata for indexed Repositories.
-- The existing bounded sync sweep obtains GitHub's isFork value.
-- Unchanged sources use the metadata prefetch path. Fork status stays unknown
-- until GitHub confirms it. Existing quota controls and pauses still apply.
UPDATE repos SET repo_meta_synced_at = NULL
WHERE is_fork IS NULL
  AND broken_since IS NULL
  AND EXISTS (
    SELECT 1 FROM skills s
    WHERE s.owner = repos.owner AND s.repo = repos.repo
      AND COALESCE(s.sync_status, '') != 'path_missing'
  );
