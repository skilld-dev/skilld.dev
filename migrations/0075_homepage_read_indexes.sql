-- Homepage activity feeds filter by event type and then read newest first.
-- The historical indexes could filter or order, but not do both, which made
-- each cache miss scan and sort the full activity type.
CREATE INDEX IF NOT EXISTS idx_activity_home_feed
  ON activity(type, occurred_at DESC, owner, repo, name, sha);

PRAGMA optimize;
