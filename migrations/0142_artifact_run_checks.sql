-- The skilld run sweep. One row is the latest `skilld run OWNER/REPO/NAME`
-- check of one Skill the registry indexes, made through the same Resolution
-- request the CLI sends.
--
-- The `sweep-skill-runs` task writes this table and nothing else. A row keeps
-- the last settled outcome while the next check is pending, so a change from
-- ready to failing is visible when it settles.
-- Cull path: drop the task, then `DROP TABLE artifact_run_checks`.
CREATE TABLE IF NOT EXISTS artifact_run_checks (
  owner TEXT NOT NULL,
  repository TEXT NOT NULL,
  name TEXT NOT NULL,
  -- 'ready' or 'failing'. NULL until the first check settles.
  outcome TEXT CHECK (outcome IN ('ready', 'failing')),
  -- The error the CLI would print: a problem code such as `INVALID_SOURCE`,
  -- or `CHECK_BLOCKED:<check name>`. NULL when ready.
  tag TEXT,
  -- The check summary or first finding, when one exists.
  detail TEXT,
  -- 1 when the same request can work later, such as `RATE_LIMITED`.
  retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  -- Unix seconds the current failure tag was first seen.
  failing_since INTEGER,
  settled_at INTEGER,
  settled_resolution_id TEXT,
  -- The Resolution the next settle reads. NULL when no check is in flight.
  pending_resolution_id TEXT,
  requested_at INTEGER,
  PRIMARY KEY (owner, repository, name)
) WITHOUT ROWID;
