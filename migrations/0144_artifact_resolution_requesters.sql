-- The signed-in account that asked for a public Resolution, kept only while
-- its build runs. When the shared GitHub credentials are rate limited, the
-- build reads GitHub with this account's own token, for this build only.
-- The build deletes the row when it settles; the daily personal data purge
-- removes any row a dead build left behind.
CREATE TABLE artifact_resolution_requesters (
  resolution_id TEXT PRIMARY KEY REFERENCES artifact_resolutions(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_artifact_resolution_requesters_created_at
  ON artifact_resolution_requesters(created_at);
