CREATE TABLE IF NOT EXISTS github_sync_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pause_until INTEGER,
  reason TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO github_sync_control (id, pause_until, reason, updated_at)
VALUES (1, NULL, NULL, unixepoch());

CREATE TABLE IF NOT EXISTS registry_maintenance (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'retry', 'complete')),
  batch_id TEXT,
  updated_at INTEGER NOT NULL,
  last_error TEXT
);
