-- Tracks Anthropic Message Batches API submissions for skill content
-- generation (summary, tags, faq). `kinds` is a JSON array of kinds included
-- in this batch so the poll task knows which skill_generated rows to UPSERT
-- when results land. One batch per submit-cycle, polled hourly.
CREATE TABLE IF NOT EXISTS ai_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anthropic_batch_id TEXT NOT NULL UNIQUE,
  kinds TEXT NOT NULL, -- JSON array, e.g. ["summary","tags","faq"]
  skill_count INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'submitted' | 'completed' | 'failed' | 'expired'
  submitted_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_batches_status ON ai_batches(status);
