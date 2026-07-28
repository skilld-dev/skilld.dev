-- A leaderboard entry is an editorial decision, not a name or skill-count
-- heuristic. Repositories remain excluded until a reviewer explicitly records
-- that their primary purpose is distributing agent skills or plugin bundles.
CREATE TABLE IF NOT EXISTS skill_repo_eligibility (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('eligible', 'rejected')),
  reason TEXT NOT NULL
    CHECK (length(trim(reason)) > 0),
  reviewed_by TEXT NOT NULL
    CHECK (length(trim(reviewed_by)) > 0),
  reviewed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_skill_repo_eligibility_status
  ON skill_repo_eligibility (status, owner, repo);

INSERT INTO skill_repo_eligibility (
  owner,
  repo,
  status,
  reason,
  reviewed_by
) VALUES (
  'harlan-zw',
  'harlan-agent-kit',
  'eligible',
  'Repository is dedicated to distributing agent skills and plugin metadata.',
  'harlan'
);
