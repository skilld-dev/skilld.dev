-- Durable email preference history supports unsubscribe recovery and reporting.
CREATE TABLE email_preference_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  list TEXT NOT NULL CHECK (list IN ('weekly', 'digest')),
  action TEXT NOT NULL CHECK (action IN ('unsubscribed', 'restored')),
  occurred_at INTEGER NOT NULL
);

CREATE INDEX email_preference_events_list_time
  ON email_preference_events (list, occurred_at);

-- `status = sent` describes the completed lifecycle. This field records the
-- provider evidence without implying delivery to an inbox.
ALTER TABLE weekly_runs ADD COLUMN provider_status TEXT;
