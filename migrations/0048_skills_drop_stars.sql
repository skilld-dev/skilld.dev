-- Drop the stale `stars` column from `skills`. Now on `repos`
-- (with `repos_stars_idx`). This is the last of the eleven post-0034 column
-- drops; after this, `skills` carries only skill-level columns.
DROP INDEX IF EXISTS idx_skills_stars;
ALTER TABLE skills DROP COLUMN stars;
