-- Durable evidence for every Workers AI and Vectorize embedding attempt.
-- The current skill_generated marker is written only in the same D1 batch
-- that records a confirmed Vectorize upsert as completed.
CREATE TABLE embedding_attempts (
  attempt_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  content_sha TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN (
      'started',
      'provider_failed',
      'rejected',
      'vector_succeeded_marker_failed',
      'completed'
    )),
  provider_stage TEXT
    CHECK (provider_stage IS NULL OR provider_stage IN ('ai', 'vectorize', 'marker')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error_code TEXT,
  error_message TEXT,
  provider_response TEXT,
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (
    (state = 'started'
      AND finished_at IS NULL
      AND provider_stage IS NULL
      AND error_code IS NULL
      AND error_message IS NULL)
    OR
    (state = 'completed'
      AND finished_at IS NOT NULL
      AND provider_stage IS NULL
      AND error_code IS NULL
      AND error_message IS NULL)
    OR
    (state IN ('provider_failed', 'rejected', 'vector_succeeded_marker_failed')
      AND finished_at IS NOT NULL
      AND provider_stage IS NOT NULL
      AND error_code IS NOT NULL
      AND error_message IS NOT NULL)
  )
);

CREATE INDEX idx_embedding_attempts_skill_started
  ON embedding_attempts (owner, repo, name, started_at DESC);
