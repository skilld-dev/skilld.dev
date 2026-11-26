-- Covering and range indexes for top measured production D1 read queries.
--
-- Production D1 insights (2026-11-26) measured:
--   - `loadGithubEvidence` (`shared/server/trending-skills.ts`): 8,732 rows/exec,
--     1.82M rows/30m (71.3M rows/24h) because `repo_star_surges` had no index
--     leading with `detected_at`, causing two full index scans per call.
--   - `loadLinkableRepoSkillNames` (`SELECT name FROM skills WHERE owner = ?
--     AND repo = ? AND source_resolved = 1 ORDER BY name`): 402,362 execs/24h,
--     59.4M rows/24h because `idx_skills_repo_resolved(owner, repo, source_resolved)`
--     did not cover `name`, forcing table lookups on every row (which carry
--     large `rendered_raw` / `rendered_html` blobs) and a sort.
--
-- `idx_skills_repo_resolved_name` has `(owner, repo, source_resolved)` as its
-- strict left prefix, so dropping `idx_skills_repo_resolved` adds zero net
-- write amplification while making both `COUNT(*)` and `SELECT name ... ORDER BY name`
-- index-only covering scans.

CREATE INDEX IF NOT EXISTS idx_repo_star_surges_detected
  ON repo_star_surges (detected_at, owner, repo);

CREATE INDEX IF NOT EXISTS idx_skills_repo_resolved_name
  ON skills (owner, repo, source_resolved, name);

DROP INDEX IF EXISTS idx_skills_repo_resolved;

PRAGMA optimize;
