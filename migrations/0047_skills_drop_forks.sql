-- Drop the stale `forks` column from `skills`. Now on `repos`.
ALTER TABLE skills DROP COLUMN forks;
