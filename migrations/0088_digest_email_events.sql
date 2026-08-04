-- First-party open/click instrumentation for digest emails (VISION principle 4:
-- digest engagement is the evidence bar for further Loop 2 investment).
-- One row per pixel fetch or click redirect. No recipient PII beyond the
-- run_id linkage that digest_runs already carries; no user agent, no IP.
CREATE TABLE digest_email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES digest_runs(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('open', 'click')),
  -- Stable per-link identity for CTR aggregation:
  --   skill:<owner>/<repo>/<name>, github:<owner>/<repo>, or url:<host><path>.
  link_key TEXT,
  url TEXT,
  occurred_at INTEGER NOT NULL,
  CHECK (occurred_at >= 0),
  CHECK (event = 'open' OR (link_key IS NOT NULL AND url IS NOT NULL))
);

CREATE INDEX idx_digest_email_events_run
  ON digest_email_events(run_id, event);

CREATE INDEX idx_digest_email_events_time
  ON digest_email_events(occurred_at DESC);
