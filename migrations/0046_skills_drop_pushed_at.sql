-- Drop the stale `pushed_at` column from `skills`. Now on `repos`
-- (with `repos_pushed_at_idx`).
ALTER TABLE skills DROP COLUMN pushed_at;
