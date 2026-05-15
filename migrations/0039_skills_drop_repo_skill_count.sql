-- Drop the stale `repo_skill_count` column from `skills`. Now on `repos`.
ALTER TABLE skills DROP COLUMN repo_skill_count;
