-- Re-measure every parked repository under the new limits.
--
-- The size guard held at 25 skills for every owner, a number drawn from the
-- curated tail alone: the largest curated repository in the registry has 18.
-- It parked every aggregator, and 32 legitimate repositories with them. The
-- limits are now 100 for a personal account and 250 for an organization,
-- because the same count means different things. A person publishing 150
-- skills is republishing someone else's work. A company publishing 150 is
-- documenting its own product surface.
--
-- Parked rows are excluded from the submit loop, so a limit change alone
-- reaches none of them. They have to be un-parked to be looked at again.
--
-- NO POLICY IN THIS MIGRATION. It clears the hold and nothing else, so the
-- guard re-measures each repository and applies the current limits itself.
-- Encoding the thresholds here would put the same rule in two places, and the
-- one in SQL would answer from `owners.kind`, which is null for 228 owners and
-- is usually not yet written when a discovered repository is first measured.
-- The guard reads the owner type from GitHub, which is the authority.
--
-- `reviewed_at` is deliberately untouched. It marks a human admission and
-- bypasses the size check, and a policy change is not a person saying yes to
-- any particular repository. A row that still exceeds its limit parks again,
-- with the applicable limit named in `last_attempt_detail`.
--
-- Measured in production 2026-08-17: 43 rows held `oversized`. Under the new
-- limits about 32 should submit and about 11 should park again.
UPDATE discovery_ledger
SET held_reason = NULL
WHERE status = 'pending'
  AND held_reason = 'oversized';
