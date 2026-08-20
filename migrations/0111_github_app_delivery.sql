-- Private Repository access is bound to one skilld Account and one selected
-- GitHub App installation. Revocation is represented in state, never deleted.
ALTER TABLE users ADD COLUMN github_token_expires_at INTEGER;
ALTER TABLE users ADD COLUMN github_refresh_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN github_refresh_token_expires_at INTEGER;
ALTER TABLE users ADD COLUMN github_token_client_id TEXT;

ALTER TABLE artifact_resolutions
ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private'));

ALTER TABLE artifact_resolutions
ADD COLUMN account_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE artifact_resolutions
ADD COLUMN github_installation_id INTEGER;

ALTER TABLE artifact_resolutions
ADD COLUMN ciphertext_sha256 TEXT
  CHECK (ciphertext_sha256 IS NULL OR length(ciphertext_sha256) = 64);

ALTER TABLE artifact_resolutions
ADD COLUMN ciphertext_bytes INTEGER
  CHECK (ciphertext_bytes IS NULL OR ciphertext_bytes > 0);

ALTER TABLE artifact_resolutions
ADD COLUMN encryption_key_id TEXT;

CREATE TABLE github_app_installations (
  installation_id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_account_id INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'suspended', 'revoked')),
  connected_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_github_app_installations_account
ON github_app_installations(account_id, state);

CREATE TABLE github_app_repositories (
  installation_id INTEGER NOT NULL REFERENCES github_app_installations(installation_id) ON DELETE CASCADE,
  repository_id INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repository TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility = 'private'),
  state TEXT NOT NULL CHECK (state IN ('selected', 'revoked')),
  selected_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (installation_id, repository_id)
);

CREATE INDEX idx_github_app_repositories_identity
ON github_app_repositories(owner COLLATE NOCASE, repository COLLATE NOCASE, state);

CREATE TABLE github_app_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  action TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE private_artifacts (
  account_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL CHECK (artifact_id GLOB 'sha256:*'),
  resolution_id TEXT NOT NULL REFERENCES artifact_resolutions(id) ON DELETE CASCADE,
  repository_id INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  content_bytes INTEGER NOT NULL CHECK (content_bytes > 0),
  ciphertext_sha256 TEXT NOT NULL CHECK (length(ciphertext_sha256) = 64),
  ciphertext_bytes INTEGER NOT NULL CHECK (ciphertext_bytes > 0),
  r2_key TEXT NOT NULL UNIQUE,
  encryption_key_id TEXT NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('available', 'blocked', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, artifact_id)
);

CREATE UNIQUE INDEX idx_private_artifacts_resolution
ON private_artifacts(resolution_id);

CREATE TABLE private_artifact_attestations (
  resolution_id TEXT PRIMARY KEY REFERENCES artifact_resolutions(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL,
  attestation_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id, artifact_id)
    REFERENCES private_artifacts(account_id, artifact_id) ON DELETE CASCADE
);

CREATE INDEX idx_private_artifact_attestations_artifact
ON private_artifact_attestations(account_id, artifact_id, created_at DESC);

CREATE TABLE artifact_download_grants (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  request_key_hash TEXT,
  request_fingerprint TEXT,
  account_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL,
  resolution_id TEXT NOT NULL REFERENCES artifact_resolutions(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_artifact_download_grants_access
ON artifact_download_grants(account_id, artifact_id, expires_at, consumed_at, revoked_at);

CREATE UNIQUE INDEX idx_artifact_download_grants_request_key
ON artifact_download_grants(request_key_hash)
WHERE request_key_hash IS NOT NULL;
