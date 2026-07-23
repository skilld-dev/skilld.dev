-- Durable ingestion order for digest cursors. Source occurrence time remains
-- diagnostic only because GitHub history can arrive after a digest closes.
ALTER TABLE activity ADD COLUMN ingested_at INTEGER;

UPDATE activity
SET ingested_at = occurred_at
WHERE ingested_at IS NULL;

CREATE TRIGGER activity_require_ingested_at
BEFORE INSERT ON activity
WHEN NEW.ingested_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'activity.ingested_at is required');
END;

CREATE TRIGGER activity_preserve_ingested_at
BEFORE UPDATE OF ingested_at ON activity
WHEN NEW.ingested_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'activity.ingested_at is required');
END;

CREATE INDEX idx_activity_ingested_id
  ON activity(ingested_at, id);

CREATE INDEX idx_activity_digest_repo_cursor
  ON activity(owner, repo, id DESC, name, sha);

-- Replace the legacy send log with a durable delivery state machine.
DROP INDEX IF EXISTS idx_digest_window;
DROP INDEX IF EXISTS idx_digest_status;
ALTER TABLE digest_runs RENAME TO digest_runs_legacy;

CREATE TABLE digest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_key TEXT NOT NULL UNIQUE,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  cursor_start INTEGER NOT NULL,
  cursor_end INTEGER NOT NULL,
  change_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL
    CHECK (status IN ('claimed', 'sending', 'uncertain', 'failed', 'sent', 'skipped')),
  claim_token TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  claim_expires_at INTEGER,
  sending_at INTEGER,
  sent_at INTEGER,
  finished_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  provider_message_id TEXT,
  provider_status TEXT,
  error_code TEXT,
  error_message TEXT,
  ai_summary_used INTEGER NOT NULL DEFAULT 0,
  ai_fallback_reason TEXT,
  ai_input_tokens INTEGER NOT NULL DEFAULT 0,
  ai_output_tokens INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, window_end),
  CHECK (length(delivery_key) > 0),
  CHECK (length(claim_token) > 0),
  CHECK (window_start <= window_end),
  CHECK (cursor_start >= 0 AND cursor_end >= cursor_start),
  CHECK (change_count >= 0),
  CHECK (attempt_count > 0),
  CHECK (ai_summary_used IN (0, 1)),
  CHECK (ai_input_tokens >= 0 AND ai_output_tokens >= 0),
  CHECK (ai_summary_used = 0 OR ai_fallback_reason IS NULL),
  CHECK (claimed_at >= 0),
  CHECK (sending_at IS NULL OR sending_at >= claimed_at),
  CHECK (sent_at IS NULL OR (sending_at IS NOT NULL AND sent_at >= sending_at)),
  CHECK (finished_at IS NULL OR finished_at >= claimed_at),
  CHECK (
    (status = 'claimed'
      AND claim_expires_at IS NOT NULL
      AND claim_expires_at > claimed_at
      AND sending_at IS NULL
      AND sent_at IS NULL
      AND finished_at IS NULL
      AND provider_message_id IS NULL
      AND provider_status IS NULL
      AND error_code IS NULL
      AND error_message IS NULL
      AND change_count = 0
      AND ai_summary_used = 0
      AND ai_fallback_reason IS NULL
      AND ai_input_tokens = 0
      AND ai_output_tokens = 0)
    OR
    (status = 'sending'
      AND claim_expires_at IS NULL
      AND sending_at IS NOT NULL
      AND sent_at IS NULL
      AND finished_at IS NULL
      AND provider_message_id IS NULL
      AND provider_status IS NULL
      AND error_code IS NULL
      AND error_message IS NULL)
    OR
    (status = 'uncertain'
      AND claim_expires_at IS NULL
      AND sending_at IS NOT NULL
      AND sent_at IS NULL
      AND finished_at IS NOT NULL
      AND finished_at >= sending_at
      AND error_code IS NOT NULL
      AND length(trim(error_code)) > 0
      AND error_message IS NOT NULL
      AND length(trim(error_message)) > 0
      AND (
        (provider_status = 'unknown'
          AND provider_message_id IS NULL)
        OR
        (provider_status = 'accepted_unpersisted'
          AND provider_message_id IS NOT NULL
          AND length(trim(provider_message_id)) > 0
          AND error_code = 'sent_persistence_failed')
      ))
    OR
    (status = 'failed'
      AND claim_expires_at IS NULL
      AND sent_at IS NULL
      AND finished_at IS NOT NULL
      AND provider_message_id IS NULL
      AND error_code IS NOT NULL
      AND error_message IS NOT NULL)
    OR
    (status = 'sent'
      AND claim_expires_at IS NULL
      AND sending_at IS NOT NULL
      AND sent_at IS NOT NULL
      AND finished_at IS NOT NULL
      AND provider_message_id IS NOT NULL
      AND length(provider_message_id) > 0
      AND provider_status IN ('accepted', 'legacy_unverified')
      AND error_code IS NULL
      AND error_message IS NULL)
    OR
    (status = 'skipped'
      AND claim_expires_at IS NULL
      AND change_count = 0
      AND sending_at IS NULL
      AND sent_at IS NULL
      AND finished_at IS NOT NULL
      AND provider_message_id IS NULL
      AND provider_status IS NULL
      AND error_code IS NULL
      AND error_message IS NULL
      AND ai_summary_used = 0
      AND ai_fallback_reason IS NULL
      AND ai_input_tokens = 0
      AND ai_output_tokens = 0)
  )
);

INSERT INTO digest_runs (
  id,
  user_id,
  delivery_key,
  window_start,
  window_end,
  cursor_start,
  cursor_end,
  change_count,
  status,
  claim_token,
  claimed_at,
  claim_expires_at,
  sending_at,
  sent_at,
  finished_at,
  attempt_count,
  provider_message_id,
  provider_status,
  error_code,
  error_message,
  ai_summary_used,
  ai_fallback_reason,
  ai_input_tokens,
  ai_output_tokens
)
SELECT
  d.id,
  d.user_id,
  'legacy-digest:' || d.user_id || ':' || d.window_end,
  d.window_start,
  d.window_end,
  COALESCE((
    SELECT MAX(a.id)
    FROM activity a
    WHERE a.ingested_at <= d.window_start
  ), 0),
  COALESCE((
    SELECT MAX(a.id)
    FROM activity a
    WHERE a.ingested_at <= d.window_end
  ), 0),
  d.change_count,
  CASE d.status
    WHEN 'queued' THEN 'failed'
    ELSE d.status
  END,
  'legacy:' || d.id,
  d.window_end,
  NULL,
  CASE WHEN d.status = 'sent' THEN COALESCE(d.sent_at, d.window_end) ELSE NULL END,
  CASE WHEN d.status = 'sent' THEN COALESCE(d.sent_at, d.window_end) ELSE NULL END,
  CASE
    WHEN d.status IN ('sent', 'skipped', 'failed', 'queued')
      THEN COALESCE(d.sent_at, d.window_end)
    ELSE NULL
  END,
  1,
  CASE
    WHEN d.status = 'sent'
      THEN COALESCE(NULLIF(trim(d.resend_id), ''), 'legacy-unrecorded:' || d.id)
    ELSE NULL
  END,
  CASE WHEN d.status = 'sent' THEN 'legacy_unverified' ELSE NULL END,
  CASE
    WHEN d.status = 'queued' THEN 'legacy_queued'
    WHEN d.status = 'failed' THEN 'legacy_failure'
    ELSE NULL
  END,
  CASE
    WHEN d.status = 'queued' THEN 'Legacy queued delivery requires retry'
    WHEN d.status = 'failed' THEN COALESCE(NULLIF(trim(d.error), ''), 'Legacy digest failure')
    ELSE NULL
  END,
  d.ai_summary_used,
  NULL,
  0,
  0
FROM digest_runs_legacy d;

DROP TABLE digest_runs_legacy;

CREATE INDEX idx_digest_claim
  ON digest_runs(user_id, window_end, claim_expires_at)
  WHERE status IN ('sending', 'uncertain', 'failed', 'claimed');

CREATE INDEX idx_digest_cursor
  ON digest_runs(user_id, window_end DESC, cursor_end)
  WHERE status IN ('sent', 'skipped');

CREATE INDEX idx_digest_status
  ON digest_runs(status, finished_at DESC, sending_at DESC);
