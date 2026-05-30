-- Per-type change counts from the bucketing pipeline (change8-style badges:
-- "3 breaking / 22 features / 162 fixes"). Stored as columns so the listing can
-- sort/filter on them. Default 0 for rows ingested before this column existed.
ALTER TABLE npm_guides ADD COLUMN count_breaking INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npm_guides ADD COLUMN count_features INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npm_guides ADD COLUMN count_fixes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npm_guides ADD COLUMN count_improvements INTEGER NOT NULL DEFAULT 0;
