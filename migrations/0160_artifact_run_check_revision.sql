-- The repository revision the run sweep last checked a Skill at. The sweep
-- checks a Skill again when its repository gets a push, instead of on a timer,
-- because every check writes a Resolution with about 60 KB of attestations.
-- NULL until the next check records it.
-- Cull path: drop the column once the sweep stops reading it.
ALTER TABLE artifact_run_checks ADD COLUMN checked_revision TEXT;
