-- Drop the stale `broken_since` column from `skills`. Authoritative copy
-- lives on `repos` since 0034; readers go through `skills_v`.
--
-- Single-column drops because D1's per-migration budget OOMs on 11
-- consecutive ALTER TABLE DROP COLUMN ops in one transaction (each one
-- internally rewrites the column on a 119k-row table).
DROP INDEX IF EXISTS idx_skills_broken;
ALTER TABLE skills DROP COLUMN broken_since;
