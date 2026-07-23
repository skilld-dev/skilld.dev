-- One operator health report per Melbourne calendar date. The delivery state
-- is also the idempotency claim, so concurrent cron or manual runs cannot send
-- duplicate emails. Failed and stale in-flight claims remain retryable.
CREATE TABLE IF NOT EXISTS daily_health_checks (
  report_date TEXT PRIMARY KEY,
  health_status TEXT NOT NULL CHECK (health_status IN ('GREEN', 'AMBER', 'RED')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('sending', 'sent', 'failed')),
  recipient TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  sent_at INTEGER,
  message_id TEXT,
  error TEXT,
  summary_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_health_checks_delivery
  ON daily_health_checks(delivery_status, claimed_at DESC);
