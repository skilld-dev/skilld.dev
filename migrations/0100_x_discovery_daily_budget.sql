-- Hard ceiling on X discovery spend.
--
-- Pay-per-use bills $0.005 per post read and every post the search returns is
-- charged, including ones we discard for pointing at no repo. Without a
-- ceiling the bill is whatever the query happens to match that day.
--
-- The counter is per UTC day because that is the window X deduplicates on.
-- `budget_day` stores the UTC date as YYYY-MM-DD; when it differs from today
-- the spend resets.
ALTER TABLE x_ingest_cursor ADD COLUMN budget_day TEXT;
ALTER TABLE x_ingest_cursor ADD COLUMN budget_spent INTEGER NOT NULL DEFAULT 0;
