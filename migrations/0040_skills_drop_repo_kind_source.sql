-- Drop the stale `repo_kind_source` column from `skills`. Now on `repos`.
ALTER TABLE skills DROP COLUMN repo_kind_source;
