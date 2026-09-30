-- IndexNow submission memory.
-- `indexnow_urls` holds the fingerprint of each URL the last time it was
-- accepted, so a URL is submitted only when it is new or its fingerprint moved.
-- `indexnow_batches` is the ledger the daily budget reads. `indexnow_state` is
-- one row: the backoff clock and, after repeated failures, the halt reason.
CREATE TABLE indexnow_urls (
  url TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE TABLE indexnow_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at INTEGER NOT NULL,
  url_count INTEGER NOT NULL CHECK (url_count > 0),
  http_status INTEGER NOT NULL
);

CREATE INDEX idx_indexnow_batches_submitted ON indexnow_batches(submitted_at);

CREATE TABLE indexnow_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  strikes INTEGER NOT NULL DEFAULT 0,
  not_before INTEGER NOT NULL DEFAULT 0,
  halt_reason TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

INSERT INTO indexnow_state (id) VALUES (1);
