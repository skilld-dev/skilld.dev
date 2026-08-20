-- Public Artifact delivery. GitHub remains the source of truth. R2 stores only
-- immutable, digest-addressed bytes used by the skilld CLI.
CREATE TABLE artifact_resolutions (
  id TEXT PRIMARY KEY,
  request_key_hash TEXT,
  request_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'requested', 'resolving', 'fetching', 'checking', 'packaging',
    'signing', 'publishing', 'ready', 'blocked', 'failed', 'revoked'
  )),
  state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  requested_owner TEXT NOT NULL,
  requested_repository TEXT NOT NULL,
  selector_type TEXT NOT NULL CHECK (selector_type IN ('path', 'named-skill')),
  selector_value TEXT NOT NULL,
  ref_type TEXT CHECK (ref_type IS NULL OR ref_type IN ('branch', 'tag', 'commit')),
  ref_value TEXT,
  repository_id INTEGER,
  resolved_owner TEXT,
  resolved_repository TEXT,
  commit_sha TEXT CHECK (commit_sha IS NULL OR length(commit_sha) = 40),
  tree_sha TEXT CHECK (tree_sha IS NULL OR length(tree_sha) = 40),
  skill_path TEXT,
  artifact_id TEXT CHECK (artifact_id IS NULL OR artifact_id GLOB 'sha256:*'),
  content_sha256 TEXT CHECK (content_sha256 IS NULL OR length(content_sha256) = 64),
  content_bytes INTEGER CHECK (content_bytes IS NULL OR content_bytes > 0),
  r2_key TEXT,
  check_results_json TEXT,
  attestation_statement_json TEXT,
  attestation_json TEXT,
  error_code TEXT,
  error_retryable INTEGER CHECK (error_retryable IS NULL OR error_retryable IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_artifact_resolutions_request_key
ON artifact_resolutions(request_key_hash)
WHERE request_key_hash IS NOT NULL;

CREATE INDEX idx_artifact_resolutions_state
ON artifact_resolutions(state, updated_at);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY CHECK (id GLOB 'sha256:*'),
  content_sha256 TEXT NOT NULL UNIQUE CHECK (length(content_sha256) = 64),
  content_bytes INTEGER NOT NULL CHECK (content_bytes > 0),
  format TEXT NOT NULL CHECK (format = 'skilld-tar-v1'),
  r2_key TEXT NOT NULL UNIQUE,
  delivery_status TEXT NOT NULL DEFAULT 'available'
    CHECK (delivery_status IN ('available', 'blocked', 'revoked')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE artifact_attestations (
  resolution_id TEXT PRIMARY KEY REFERENCES artifact_resolutions(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  attestation_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_artifact_attestations_artifact
ON artifact_attestations(artifact_id, created_at DESC);

CREATE TABLE artifact_check_results (
  resolution_id TEXT NOT NULL REFERENCES artifact_resolutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'warn', 'fail', 'error')),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  summary TEXT,
  findings_json TEXT NOT NULL DEFAULT '[]',
  checked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (resolution_id, name)
);

CREATE INDEX idx_artifact_check_results_current
ON artifact_check_results(resolution_id, required, outcome);
