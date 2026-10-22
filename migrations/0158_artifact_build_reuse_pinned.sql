-- Seek a pinned reuse lookup instead of reading every ready row of a commit.
--
-- `findReadyPublicBuild` in `layers/artifact-delivery/server/utils/state.ts`
-- looks up a ready public build two ways. Migration 0131 serves the lookup
-- made after GitHub resolved the request. The lookup pinned to a commit has
-- no Repository ID yet, so of 0131's columns it can only supply the commit:
-- each execution read every ready row of that commit and sorted them. In the
-- week to 2026-10-18, 31,984 executions read about 878 rows each, 20.9% of
-- all Artifact lookup time.
--
-- One index per pinned variant. A build found by Skill path matches
-- `skill_path`; a build found by Skill name matches `selector_type` and
-- `selector_value`. No single column order seeks every equality column of
-- both: a lookup cannot seek past the first column it leaves unconstrained.
--
-- Each index ends with `created_at DESC, id DESC`, the ORDER BY of the
-- lookup, so SQLite reads candidates newest first and stops at the first one
-- whose Artifact is available, instead of sorting the matching rows.
--
-- The WHERE clause must stay textually equal to the query's filter, or SQLite
-- ignores the index. Only ready public rows enter it: a private Artifact is
-- never reused. Migration 0131 stays: the resolved lookup still seeks through
-- (commit_sha, repository_id, skill_path).
CREATE INDEX IF NOT EXISTS idx_artifact_resolutions_ready_public_pinned_path
  ON artifact_resolutions(commit_sha, resolved_owner COLLATE NOCASE, resolved_repository COLLATE NOCASE, skill_path, created_at DESC, id DESC)
  WHERE state = 'ready' AND visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_artifact_resolutions_ready_public_pinned_named
  ON artifact_resolutions(commit_sha, resolved_owner COLLATE NOCASE, resolved_repository COLLATE NOCASE, selector_type, selector_value, created_at DESC, id DESC)
  WHERE state = 'ready' AND visibility = 'public';
