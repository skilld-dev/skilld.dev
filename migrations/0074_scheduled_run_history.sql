-- Durable lifecycle for every application-owned scheduled task invocation.
CREATE TABLE scheduled_runs (
  run_id TEXT PRIMARY KEY,
  task_name TEXT NOT NULL CHECK (length(trim(task_name)) > 0),
  declared_cron TEXT NOT NULL CHECK (length(trim(declared_cron)) > 0),
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'expired')),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > started_at),
  finished_at INTEGER,
  duration_ms INTEGER,
  error TEXT,
  scheduled_at_ms INTEGER,
  trigger_cron TEXT,
  cf_invocation_id TEXT,
  cf_version_id TEXT,
  CHECK (
    (status = 'started'
      AND finished_at IS NULL
      AND duration_ms IS NULL
      AND error IS NULL)
    OR
    (status = 'succeeded'
      AND finished_at IS NOT NULL
      AND finished_at >= started_at
      AND duration_ms IS NOT NULL
      AND duration_ms >= 0
      AND error IS NULL)
    OR
    (status IN ('failed', 'expired')
      AND finished_at IS NOT NULL
      AND finished_at >= started_at
      AND duration_ms IS NOT NULL
      AND duration_ms >= 0
      AND error IS NOT NULL
      AND length(trim(error)) > 0)
  ),
  CHECK (scheduled_at_ms IS NULL OR scheduled_at_ms >= 0),
  CHECK (trigger_cron IS NULL OR length(trim(trigger_cron)) > 0),
  CHECK (cf_invocation_id IS NULL OR length(trim(cf_invocation_id)) > 0),
  CHECK (cf_version_id IS NULL OR length(trim(cf_version_id)) > 0)
);

CREATE INDEX idx_scheduled_runs_task_latest
  ON scheduled_runs(task_name, started_at DESC, run_id DESC);

CREATE INDEX idx_scheduled_runs_started_expiry
  ON scheduled_runs(expires_at)
  WHERE status = 'started';

CREATE TRIGGER scheduled_runs_terminal_is_final
BEFORE UPDATE ON scheduled_runs
WHEN OLD.status != 'started'
BEGIN
  SELECT RAISE(ABORT, 'scheduled run terminal state is final');
END;

CREATE TRIGGER scheduled_runs_legal_transition
BEFORE UPDATE OF status ON scheduled_runs
WHEN OLD.status = 'started'
  AND NEW.status NOT IN ('succeeded', 'failed', 'expired')
BEGIN
  SELECT RAISE(ABORT, 'illegal scheduled run state transition');
END;
