-- Trim redundant secondary indexes and guard the skills FTS update trigger.
--
-- Production D1 insights measured:
--   - `INSERT INTO skills`: 14 rows written/exec (18 secondary indexes + PK + FTS).
--   - `UPDATE skills` (sync metadata): 5.0 rows written/exec because `skills_au`
--     fired unconditionally on every column update (re-indexing `skills_fts`
--     even when none of the six FTS columns changed) and `idx_skills_last_synced_at`
--     rewrote on every sync.
--   - `UPDATE repos` (metadata check): 5.0 rows written/exec including
--     `repos_pushed_at_idx`, which no query reads.
--
-- Every dropped index was audited across the full codebase and checked with
-- production EXPLAIN QUERY PLAN:
--   - idx_skills_owner_repo_name_key: exact duplicate of idx_skills_identity_path
--   - idx_skills_owner: strict left prefix of PRIMARY KEY (owner, repo, name)
--   - idx_skills_owner_repo: strict left prefix of PRIMARY KEY (owner, repo, name)
--   - idx_skills_installs: `installs` is retired (always 0, no SQL predicates)
--   - idx_skills_target_package: no SQL predicates or sorts on target_package
--   - idx_skills_ai_gen_sha: only predicate is `IS NULL OR != current_sha` (SCAN)
--   - idx_skills_last_synced_at: rewritten on every sync; reconcile uses
--     repos_broken_idx + idx_skills_repo_resolved
--   - idx_skills_modified: sort='updated' uses repos_broken_idx + idx_skills_repo_resolved;
--     repo-scoped recency uses idx_skills_repo_recent
--   - idx_skills_like_count: sort='likes' uses repos_broken_idx + idx_skills_repo_resolved
--   - repos_kind_idx: low-cardinality `!= 'aggregator'` never uses index
--   - repos_pushed_at_idx: no SQL WHERE or ORDER BY on repos.pushed_at

DROP INDEX IF EXISTS idx_skills_owner_repo_name_key;
DROP INDEX IF EXISTS idx_skills_owner;
DROP INDEX IF EXISTS idx_skills_owner_repo;
DROP INDEX IF EXISTS idx_skills_installs;
DROP INDEX IF EXISTS idx_skills_target_package;
DROP INDEX IF EXISTS idx_skills_ai_gen_sha;
DROP INDEX IF EXISTS idx_skills_last_synced_at;
DROP INDEX IF EXISTS idx_skills_modified;
DROP INDEX IF EXISTS idx_skills_like_count;

DROP INDEX IF EXISTS repos_kind_idx;
DROP INDEX IF EXISTS repos_pushed_at_idx;

-- Mirror `ai_ready_pages_au`: only rewrite `skills_fts` when an indexed FTS
-- column actually changes.
DROP TRIGGER IF EXISTS skills_au;
CREATE TRIGGER skills_au
AFTER UPDATE OF name, owner, repo, display_name, slug, description ON skills
WHEN old.name IS NOT new.name
  OR old.owner IS NOT new.owner
  OR old.repo IS NOT new.repo
  OR old.display_name IS NOT new.display_name
  OR old.slug IS NOT new.slug
  OR old.description IS NOT new.description
BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug, description)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug, old.description);
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug, description)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug, new.description);
END;
