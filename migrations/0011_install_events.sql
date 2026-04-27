-- Install-intent telemetry. Every time a user copies an install command, we
-- record one row. This is the success-metric ground truth for
-- install-through-rate per skill / collection / surface.
CREATE TABLE IF NOT EXISTS install_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at INTEGER NOT NULL,
  surface TEXT NOT NULL,
  kind TEXT NOT NULL,
  owner TEXT,
  name TEXT,
  handle TEXT,
  slug TEXT
);

CREATE INDEX IF NOT EXISTS idx_install_events_recent ON install_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_install_events_skill ON install_events (kind, owner, name);
CREATE INDEX IF NOT EXISTS idx_install_events_collection ON install_events (kind, handle, slug);
