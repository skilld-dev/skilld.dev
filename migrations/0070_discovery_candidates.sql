-- Durable GitHub discovery lifecycle. Deliberately empty on creation: the
-- historical skill-less repo inventory needs a reviewed production backfill.
CREATE TABLE discovery_candidates (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL
    CHECK (source IN ('owned_scan', 'github_search', 'manual')),
  first_discovered_at INTEGER NOT NULL,
  last_discovered_at INTEGER NOT NULL,
  last_attempted_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'indexed', 'verified_only', 'already_admitted', 'rejected', 'retryable_failure')),
  rejection_reason TEXT,
  last_error TEXT,
  retry_state TEXT NOT NULL DEFAULT 'ready'
    CHECK (retry_state IN ('ready', 'claimed', 'retry_scheduled', 'exhausted', 'complete')),
  next_retry_at INTEGER,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  reconsideration_count INTEGER NOT NULL DEFAULT 0 CHECK (reconsideration_count >= 0),
  claimed_at INTEGER,
  claim_token TEXT,
  PRIMARY KEY (owner, repo),
  CHECK (first_discovered_at <= last_discovered_at),
  CHECK (
    (retry_state IN ('ready', 'claimed') AND outcome = 'pending')
    OR (retry_state IN ('retry_scheduled', 'exhausted') AND outcome IN ('rejected', 'retryable_failure'))
    OR (retry_state = 'complete' AND outcome IN ('indexed', 'verified_only', 'already_admitted'))
  ),
  CHECK (
    (retry_state = 'claimed' AND claimed_at IS NOT NULL AND claim_token IS NOT NULL)
    OR (retry_state <> 'claimed' AND claimed_at IS NULL AND claim_token IS NULL)
  ),
  CHECK (
    (retry_state = 'retry_scheduled' AND next_retry_at IS NOT NULL)
    OR (retry_state <> 'retry_scheduled' AND next_retry_at IS NULL)
  ),
  CHECK (
    (outcome = 'rejected' AND rejection_reason IS NOT NULL AND last_error IS NULL)
    OR (outcome = 'retryable_failure' AND rejection_reason IS NULL AND last_error IS NOT NULL)
    OR (outcome NOT IN ('rejected', 'retryable_failure') AND rejection_reason IS NULL AND last_error IS NULL)
  )
);

CREATE INDEX idx_discovery_candidates_due
  ON discovery_candidates(retry_state, next_retry_at, claimed_at, last_discovered_at, owner, repo);

-- Non-unique by design: historical duplicates exist. Sync uses this index to
-- make each atomic INSERT ... WHERE NOT EXISTS activity check narrow.
CREATE INDEX idx_activity_sync_dedupe
  ON activity(type, owner, repo, name, sha);
