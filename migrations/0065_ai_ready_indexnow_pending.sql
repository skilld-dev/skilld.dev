-- The ai-ready cron checks this exact predicate every five minutes. Without a
-- matching partial index, both its COUNT and route batch scan every indexed
-- page even when no IndexNow work is pending.
CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_indexnow_pending
  ON ai_ready_pages(route)
  WHERE indexed = 1
    AND is_error = 0
    AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at);
