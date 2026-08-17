-- A deleted repository is an answer, not a decision waiting on a person.
--
-- `held_reason` means one thing: the row is parked until someone looks at it.
-- The size guard also used it for `repo-gone`, which nobody can act on. A
-- reviewer cannot release a repository that no longer exists, because releasing
-- it only enqueues a submission that 404s, and rejecting it records a human
-- verdict on something GitHub already decided.
--
-- Measured in production 2026-08-17: 24 of the 67 parked rows were `repo-gone`,
-- so 36% of the review queue was unactionable and growing. The queue is the
-- product surface for the size guard, and a queue that fills with rows nobody
-- can clear stops being read.
--
-- `gone` is terminal, like `rejected`. The submit loop skips it, the review
-- surface never shows it, and `last_attempt_outcome` still carries `repo-gone`
-- so the audit trail names who decided: the source, not us.
--
-- SQLite cannot alter a CHECK constraint, so `status` is widened by rebuild.
-- Column list mirrors 0103 plus the three columns 0106 added.
CREATE TABLE discovery_ledger_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('x', 'hn', 'bsky')),
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  evidence_url TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  evidence_score INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 1,
  -- 'pending'   discovered, not yet submitted to the registry
  -- 'submitted' registry/repository-submission job enqueued
  -- 'indexed'   the repo resolved to at least one skill
  -- 'empty'     submission ran and the repo holds no skills
  -- 'rejected'  a human said no; never resubmit
  -- 'gone'      the repo no longer exists on GitHub; never resubmit
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'indexed', 'empty', 'rejected', 'gone')),
  submitted_at INTEGER,
  announced_at INTEGER,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  review_note TEXT,
  skill_count INTEGER,
  held_reason TEXT,
  last_attempt_at INTEGER,
  last_attempt_outcome TEXT,
  last_attempt_detail TEXT,
  UNIQUE (source, owner, repo)
);

INSERT INTO discovery_ledger_new (
  id, source, owner, repo, evidence_url, evidence_text, evidence_score,
  first_seen_at, last_seen_at, mention_count, status, submitted_at,
  announced_at, reviewed_at, reviewed_by, review_note, skill_count, held_reason,
  last_attempt_at, last_attempt_outcome, last_attempt_detail
)
SELECT
  id, source, owner, repo, evidence_url, evidence_text, evidence_score,
  first_seen_at, last_seen_at, mention_count,
  -- Backfill the rows the old shape stranded. `last_attempt_outcome` is left
  -- as it was, so a row still says why it closed.
  CASE WHEN held_reason = 'repo-gone' THEN 'gone' ELSE status END,
  submitted_at,
  announced_at, reviewed_at, reviewed_by, review_note, skill_count,
  CASE WHEN held_reason = 'repo-gone' THEN NULL ELSE held_reason END,
  last_attempt_at, last_attempt_outcome, last_attempt_detail
FROM discovery_ledger;

DROP TABLE discovery_ledger;
ALTER TABLE discovery_ledger_new RENAME TO discovery_ledger;

-- Indexes do not survive the rebuild; recreate every one from 0097, 0101,
-- 0103 and 0106.
CREATE INDEX idx_discovery_ledger_status
  ON discovery_ledger (status, evidence_score DESC, last_seen_at DESC);
CREATE INDEX idx_discovery_ledger_repo ON discovery_ledger (owner, repo);
CREATE INDEX idx_discovery_ledger_submittable
  ON discovery_ledger (evidence_score DESC, last_seen_at DESC)
  WHERE status = 'pending' AND held_reason IS NULL;
CREATE INDEX idx_discovery_ledger_held
  ON discovery_ledger (skill_count DESC)
  WHERE held_reason IS NOT NULL;
CREATE INDEX idx_discovery_ledger_source_rank
  ON discovery_ledger (source, evidence_score DESC, last_seen_at DESC)
  WHERE status = 'pending' AND held_reason IS NULL;
CREATE INDEX idx_discovery_ledger_attempt
  ON discovery_ledger (last_attempt_outcome, last_attempt_at DESC)
  WHERE status = 'pending';
