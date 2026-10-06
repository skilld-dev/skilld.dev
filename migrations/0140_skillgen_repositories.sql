-- Skillgen runs only on repositories a maintainer opted in on skilld.dev.
-- Installing the skilld-skillgen GitHub App alone starts nothing. The
-- skill-harness Worker reads this table through
-- /api/internal/skillgen/opt-ins before it queues a job.
--
-- Owner and repository keep GitHub's casing and compare without case, as
-- GitHub does. Account deletion removes the account's rows.
CREATE TABLE IF NOT EXISTS skillgen_repositories (
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  user_id INTEGER NOT NULL,
  opted_in_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_skillgen_repositories_user ON skillgen_repositories(user_id);
