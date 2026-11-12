-- The Resolution whose attestation a reused build serves.
--
-- A build that reuses a ready public build used to sign a new statement and
-- store another copy of the same attestation: about 33 KB on the row and
-- 23 KB in `artifact_attestations`. In a 12-hour sample on 2026-11-12, 1,967
-- ready Resolutions covered 142 Artifacts. A reused build now stores no
-- attestation. It names the Resolution that holds one, and readers serve that.
--
-- It always names a Resolution that signed its own attestation, never another
-- reused build. NULL for every build that signed its own.
ALTER TABLE artifact_resolutions ADD COLUMN attestation_resolution_id TEXT;

-- The prune keeps a Resolution while a reused build names it. Only reused
-- builds enter this index.
CREATE INDEX IF NOT EXISTS idx_artifact_resolutions_attestation_resolution
  ON artifact_resolutions(attestation_resolution_id)
  WHERE attestation_resolution_id IS NOT NULL;
