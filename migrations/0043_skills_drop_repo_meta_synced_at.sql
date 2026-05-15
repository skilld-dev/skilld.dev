-- Drop the stale `repo_meta_synced_at` column from `skills`. Now on `repos`.
ALTER TABLE skills DROP COLUMN repo_meta_synced_at;
