-- Persist skills.sh rankings as discovery evidence. GitHub remains the source
-- of skill content and existing sync trust gates remain authoritative.

CREATE TABLE skills_sh_crawl_runs (
  run_id TEXT PRIMARY KEY,
  crawled_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('started', 'complete')),
  views TEXT NOT NULL CHECK (json_valid(views)),
  skills_observed INTEGER NOT NULL CHECK (skills_observed > 0),
  repos_observed INTEGER NOT NULL CHECK (repos_observed > 0),
  ignored_well_known INTEGER NOT NULL DEFAULT 0 CHECK (ignored_well_known >= 0),
  leaderboard_repos_seeded INTEGER NOT NULL DEFAULT 0
    CHECK (leaderboard_repos_seeded >= 0),
  CHECK (
    (status = 'started' AND completed_at IS NULL)
    OR (status = 'complete' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE skills_sh_discovery_observations (
  run_id TEXT NOT NULL REFERENCES skills_sh_crawl_runs(run_id) ON DELETE CASCADE,
  view TEXT NOT NULL CHECK (view IN ('trending', 'all-time')),
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  skill TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank > 0),
  installs_label TEXT NOT NULL,
  installs_estimate INTEGER NOT NULL CHECK (installs_estimate >= 0),
  source_url TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, view, owner, repo, skill)
);

CREATE INDEX idx_skills_sh_observations_repo
  ON skills_sh_discovery_observations(owner, repo, observed_at DESC);

CREATE INDEX idx_skills_sh_observations_view_rank
  ON skills_sh_discovery_observations(view, observed_at DESC, rank);

CREATE TABLE discovery_candidates_new (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL
    CHECK (source IN (
      'owned_scan', 'github_search', 'historical_inventory', 'manual', 'skills_sh'
    )),
  first_discovered_at INTEGER NOT NULL,
  last_discovered_at INTEGER NOT NULL,
  last_attempted_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN (
      'pending', 'indexed', 'verified_only', 'already_admitted', 'rejected', 'retryable_failure'
    )),
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
    OR (
      outcome NOT IN ('rejected', 'retryable_failure')
      AND rejection_reason IS NULL
      AND last_error IS NULL
    )
  )
);

INSERT INTO discovery_candidates_new (
  owner, repo, source, first_discovered_at, last_discovered_at,
  last_attempted_at, attempt_count, outcome, rejection_reason, last_error,
  retry_state, next_retry_at, owner_verified, reconsideration_count,
  claimed_at, claim_token
)
SELECT
  owner, repo, source, first_discovered_at, last_discovered_at,
  last_attempted_at, attempt_count, outcome, rejection_reason, last_error,
  retry_state, next_retry_at, owner_verified, reconsideration_count,
  claimed_at, claim_token
FROM discovery_candidates;

DROP TABLE discovery_candidates;
ALTER TABLE discovery_candidates_new RENAME TO discovery_candidates;

CREATE INDEX idx_discovery_candidates_due
  ON discovery_candidates(
    retry_state, next_retry_at, claimed_at, last_discovered_at, owner, repo
  );
