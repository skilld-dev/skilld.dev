-- One immediate operator alert per X failure cause every 24 hours.
-- Both X tasks share this table, so one incident cannot send two emails.
CREATE TABLE x_api_alerts (
  fingerprint TEXT PRIMARY KEY CHECK (length(trim(fingerprint)) > 0),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  next_alert_at INTEGER NOT NULL,
  last_sent_at INTEGER,
  message_id TEXT,
  last_task TEXT NOT NULL CHECK (last_task IN ('refresh-x-engagement', 'sync-x-mentions')),
  last_error TEXT NOT NULL CHECK (length(trim(last_error)) > 0),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (next_alert_at >= first_seen_at),
  CHECK (last_sent_at IS NULL OR last_sent_at >= first_seen_at)
);
