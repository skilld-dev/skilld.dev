-- Track pins name one Skill as `owner/repo/name`. An `owner/name` pin matched
-- every repository of one owner that shipped a Skill of that name, so
-- `/skills/design` listed two of its pins twice.
--
-- The pinned arm of `clusterMembersSql` (`cluster-membership.ts`) now matches
-- `s.owner || '/' || s.repo || '/' || s.name IN (...)`. This index serves that
-- expression, as idx_skills_owner_name_key served the old one. The expression
-- matches the query without the table alias, as in migration 0123.
--
-- No query reads the old expression after this change, so its index goes.
CREATE INDEX IF NOT EXISTS idx_skills_owner_repo_name_key
  ON skills((owner || '/' || repo || '/' || name));

DROP INDEX IF EXISTS idx_skills_owner_name_key;
