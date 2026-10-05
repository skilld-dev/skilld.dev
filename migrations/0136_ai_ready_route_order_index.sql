-- Match the AI Ready listing filter and route order so LIMIT stops early.
-- Existing status indexes still require sorting every eligible page.
CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_status_route
ON ai_ready_pages(indexed, is_error, route);
