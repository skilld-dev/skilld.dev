-- A bounded run resumes the unread tail instead of buying page one again.
ALTER TABLE x_ingest_cursor ADD COLUMN pending_newest_id TEXT;
ALTER TABLE x_ingest_cursor ADD COLUMN pending_started_at INTEGER;
ALTER TABLE x_ingest_cursor ADD COLUMN next_token TEXT CHECK (
  (next_token IS NULL AND pending_newest_id IS NULL AND pending_started_at IS NULL)
  OR (next_token IS NOT NULL AND pending_started_at IS NOT NULL)
);
