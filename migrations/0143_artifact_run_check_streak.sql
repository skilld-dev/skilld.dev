-- The run check flag. The Skill page flags its run command once two checks in
-- a row failed for a reason a retry cannot change, and the curated surfaces
-- leave the Skill out while the flag stands. One passing check clears it.
--
-- A retryable failure, such as a spent GitHub quota, neither counts nor
-- resets the streak, because it says nothing about the Skill.
-- Cull path: drop the flag route, then drop these columns and the index.
ALTER TABLE artifact_run_checks ADD COLUMN failure_streak INTEGER NOT NULL DEFAULT 0;
-- Unix seconds the last failure in the streak settled.
ALTER TABLE artifact_run_checks ADD COLUMN failed_at INTEGER;

-- A row whose last check failed that way already has one failure in a row.
UPDATE artifact_run_checks
SET failure_streak = 1, failed_at = settled_at
WHERE outcome = 'failing' AND retryable = 0;

-- The flag route reads only flagged rows. Nearly every row holds 0, so the
-- index keeps that read to the flagged rows instead of the whole table.
CREATE INDEX IF NOT EXISTS idx_artifact_run_checks_failure_streak
  ON artifact_run_checks (failure_streak);
