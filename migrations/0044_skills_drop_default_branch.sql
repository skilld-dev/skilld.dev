-- Drop the stale `default_branch` column from `skills`. Now on `repos`.
ALTER TABLE skills DROP COLUMN default_branch;
