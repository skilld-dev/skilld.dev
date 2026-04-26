-- Per-follower cache of Bluesky follow graph + per-follower refresh state.
-- Source of truth is the AppView (app.bsky.graph.getFollows). Refresh is gated
-- by follows_refresh_state.next_eligible_at to avoid abuse and reduce load.

CREATE TABLE IF NOT EXISTS follows_cache (
  follower_did TEXT NOT NULL,
  followed_did TEXT NOT NULL,
  cached_at    INTEGER NOT NULL,
  PRIMARY KEY (follower_did, followed_did)
);

CREATE INDEX IF NOT EXISTS idx_follows_cache_follower ON follows_cache (follower_did, cached_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_cache_followed ON follows_cache (followed_did);

CREATE TABLE IF NOT EXISTS follows_refresh_state (
  follower_did     TEXT PRIMARY KEY,
  refreshed_at     INTEGER NOT NULL,
  next_eligible_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_follows_refresh_eligible ON follows_refresh_state (next_eligible_at);
CREATE INDEX IF NOT EXISTS idx_follows_refresh_stalest  ON follows_refresh_state (refreshed_at);
