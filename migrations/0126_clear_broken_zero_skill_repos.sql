-- Broken means GitHub could not return the tree. Sync used to set
-- `broken_since` when it read a tree that held zero Skills, whether the author
-- deleted them or only test fixtures remained. Sync no longer does that.
--
-- This clears the old verdict for every Repository in that state: at least one
-- Skill row, and every row `path_missing`. Only a readable tree writes
-- `path_missing`; a 404 writes `repo_missing` and leaves `path_missing` rows
-- alone. These Repositories stay out of the sync sweeps, which now skip a
-- Repository with no live rows, and out of every broken count.
UPDATE repos
SET broken_since = NULL
WHERE broken_since IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM skills s
    WHERE s.owner = repos.owner AND s.repo = repos.repo
  )
  AND NOT EXISTS (
    SELECT 1 FROM skills s
    WHERE s.owner = repos.owner AND s.repo = repos.repo
      AND COALESCE(s.sync_status, '') != 'path_missing'
  );
