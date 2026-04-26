-- Materialized event feed for "Recently published" / "Recently updated" surfaces.
-- Sync worker writes events here; homepage queries it directly. No fan-out joins on read.
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  sha TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_recent ON activity (occurred_at DESC, type);
CREATE INDEX IF NOT EXISTS idx_activity_skill ON activity (owner, name);
