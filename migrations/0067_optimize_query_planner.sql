-- Refresh query-planner statistics after the index migrations. Cloudflare
-- recommends PRAGMA optimize after creating indexes so D1 can choose the most
-- efficient plans without forcing ANALYZE across every table unconditionally.
PRAGMA optimize;
