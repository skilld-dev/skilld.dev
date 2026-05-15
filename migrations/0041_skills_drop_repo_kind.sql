-- Drop the stale `repo_kind` column from `skills`. Now on `repos`
-- (with `repos_kind_idx`). Any read-side filter goes through `skills_v`.
-- The composite index `idx_skills_repo_kind (repo_kind, trust_tier, stars)`
-- still exists on remote (the snapshot built from `schema.sql` didn't show
-- it, but the live DB does), so we drop it first.
DROP INDEX IF EXISTS idx_skills_repo_kind;
ALTER TABLE skills DROP COLUMN repo_kind;
