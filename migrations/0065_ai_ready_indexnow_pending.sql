-- The ai-ready cron checks this exact predicate every five minutes. Without a
-- matching partial index, both its COUNT and route batch scan every indexed
-- page even when no IndexNow work is pending.
--
-- nuxt-ai-ready normally creates this table during Worker startup. Define the
-- same base table here as well so migrations can bootstrap an empty local D1
-- database before the Worker has run; the module's remaining CREATE IF NOT
-- EXISTS statements still initialize its metadata, FTS, and cron tables.
CREATE TABLE IF NOT EXISTS ai_ready_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT UNIQUE NOT NULL,
  route_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  headings TEXT NOT NULL DEFAULT '[]',
  keywords TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT,
  updated_at TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  indexed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'prerender',
  last_seen_at INTEGER,
  indexnow_synced_at INTEGER,
  locale TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_indexnow_pending
  ON ai_ready_pages(route)
  WHERE indexed = 1
    AND is_error = 0
    AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at);
