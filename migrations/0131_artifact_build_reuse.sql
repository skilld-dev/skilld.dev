-- Find a ready public build of the same commit, so a repeat Resolution can
-- reuse its Artifact instead of loading the Skill from GitHub again.
--
-- Over 14 days to 2026-09-30, 264 public builds covered only 89 distinct
-- (Repository, commit, Skill path) builds. Each build makes about 9 GitHub reads.
--
-- The build looks up a ready row in two ways (`findReadyPublicBuild` in
-- `layers/artifact-delivery/server/utils/state.ts`):
--
-- - After GitHub resolves the request: by commit, Repository ID, Skill path,
--   tree, owner and Repository name.
-- - Before any GitHub read, for a request pinned to a commit: by commit, owner
--   and Repository name, and the Skill path or name. The Repository ID is not
--   known yet.
--
-- The index leads with the commit so that both lookups can seek on it. The
-- WHERE clause must stay textually equal to the query's filter, or SQLite
-- ignores the index. Only ready public rows enter it: a private Artifact is
-- never reused.
CREATE INDEX IF NOT EXISTS idx_artifact_resolutions_ready_public_commit
  ON artifact_resolutions(commit_sha, repository_id, skill_path)
  WHERE state = 'ready' AND visibility = 'public';
