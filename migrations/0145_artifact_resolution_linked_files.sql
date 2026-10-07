-- 1 when the skilld CLI that asked for the Resolution sent
-- `Skilld-Capabilities: linked-files`. Its Artifact may then list linked files:
-- Skill files it reads from GitHub at the attested commit. Every other CLI
-- refuses that statement field, so its Resolutions keep 0. See ADR-0013.
-- Cull path: drop the column once every supported skilld CLI reads linked files.
ALTER TABLE artifact_resolutions ADD COLUMN linked_files INTEGER NOT NULL DEFAULT 0;
