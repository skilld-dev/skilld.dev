-- A Skill revision names its instructions, not its supporting file inventory.
-- Leave old snapshots unpinned until sync captures both at the same commit.
ALTER TABLE skills ADD COLUMN rendered_commit_sha TEXT;

-- Clear both skip cursors for every Skill repository, including dormant ones.
-- Root inventories and legacy snapshots then refresh without another push.
UPDATE repos SET last_tree_sha = NULL, pushed_at = NULL, repo_meta_synced_at = NULL
WHERE EXISTS (
  SELECT 1 FROM skills s
  WHERE s.owner = repos.owner AND s.repo = repos.repo
);
