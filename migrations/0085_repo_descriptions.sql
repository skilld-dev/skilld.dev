-- Keep public repository copy distinct from internal editorial rationale.
-- Existing visible rows are refreshed through the priority queue, but do not
-- participate in the discovery lifecycle again.

ALTER TABLE repos ADD COLUMN description TEXT;

CREATE TABLE IF NOT EXISTS skill_repo_review_sync_outbox (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo)
);

ALTER TABLE skill_repo_review_sync_outbox
ADD COLUMN claim_discovery INTEGER NOT NULL DEFAULT 1
CHECK (claim_discovery IN (0, 1));

INSERT INTO skill_repo_review_sync_outbox (
  owner, repo, queued_at, claim_discovery
)
SELECT
  repository.owner,
  repository.repo,
  unixepoch(),
  0
FROM repos AS repository
JOIN owners AS owner
  ON owner.owner = repository.owner
 AND owner.kind = 'user'
JOIN skill_repo_eligibility AS eligibility
  ON eligibility.owner = repository.owner
 AND eligibility.repo = repository.repo
 AND eligibility.status = 'eligible'
WHERE repository.broken_since IS NULL
  AND EXISTS (
    SELECT 1
    FROM skills AS skill
    WHERE skill.owner = repository.owner
      AND skill.repo = repository.repo
  )
ON CONFLICT(owner, repo) DO UPDATE SET
  queued_at = MIN(skill_repo_review_sync_outbox.queued_at, excluded.queued_at),
  claim_discovery = MAX(
    skill_repo_review_sync_outbox.claim_discovery,
    excluded.claim_discovery
  );
