-- Account keys are wrapped by the service key. Plain key bytes never enter D1.
CREATE TABLE private_artifact_keys (
  account_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL UNIQUE,
  wrapped_key TEXT NOT NULL,
  wrap_algorithm TEXT NOT NULL CHECK (wrap_algorithm = 'A256KW'),
  state TEXT NOT NULL CHECK (state IN ('active', 'retired', 'revoked')),
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  revoked_at INTEGER,
  PRIMARY KEY (account_id, key_id)
);

CREATE UNIQUE INDEX idx_private_artifact_keys_active
ON private_artifact_keys(account_id) WHERE state = 'active';
