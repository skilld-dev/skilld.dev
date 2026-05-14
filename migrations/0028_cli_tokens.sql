CREATE TABLE cli_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  prev_refresh_hash TEXT,
  prev_refresh_expires_at INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('oauth','pat','oidc')),
  scopes TEXT NOT NULL DEFAULT 'cli',
  device_label TEXT,
  cli_version TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX idx_cli_tokens_user ON cli_tokens(user_id, revoked_at);
CREATE UNIQUE INDEX idx_cli_tokens_refresh
  ON cli_tokens(refresh_hash) WHERE revoked_at IS NULL;
