-- Drop the stale `last_tree_sha` column from `skills`. Now on `repos`.
ALTER TABLE skills DROP COLUMN last_tree_sha;
