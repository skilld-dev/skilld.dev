-- Drop the stale `repo_created_at` column from `skills`. Now on `repos`.
ALTER TABLE skills DROP COLUMN repo_created_at;
