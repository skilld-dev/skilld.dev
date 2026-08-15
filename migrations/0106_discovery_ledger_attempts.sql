-- Make a silent submit attempt impossible.
--
-- `submitDiscoveredRepos` had two exits that wrote nothing: a sizer that could
-- not answer, and a throw from `enqueue`. Both correctly leave the row
-- `pending` for the next run to retry. Neither left any trace of having tried.
--
-- The cost of that was measured on 2026-08-15. Five root-skill repos sat at
-- the head of the submit queue for sixteen hours, re-attempted roughly every
-- fifteen minutes, and the archive could not distinguish "the GitHub token
-- cannot size these" from "the enqueue is throwing" from "the query never
-- reached them". A prior session read the flat counts as throughput and closed
-- the thread; the rows had not moved.
--
-- `last_attempt_at` is what makes the invariant checkable: every row the loop
-- considered carries the current run's timestamp when the run ends. A row that
-- is pending with a stale stamp was never reached; a row that is pending with a
-- fresh stamp was reached and rejected, and `last_attempt_outcome` says by
-- which branch.
ALTER TABLE discovery_ledger ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE discovery_ledger ADD COLUMN last_attempt_outcome TEXT;
ALTER TABLE discovery_ledger ADD COLUMN last_attempt_detail TEXT;

-- The triage read: pending rows grouped by why they last failed to move.
CREATE INDEX idx_discovery_ledger_attempt
  ON discovery_ledger (last_attempt_outcome, last_attempt_at DESC)
  WHERE status = 'pending';
