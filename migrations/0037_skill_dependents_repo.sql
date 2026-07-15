-- Migration 0033 already rebuilds the dependent tables and adds activity.repo.
-- Keep this filename as a no-op because deployed databases may already record
-- it, while fresh local databases still need a complete sequential history.
SELECT 1;
