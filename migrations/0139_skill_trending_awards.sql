-- Trending awards (ADR-0011). One row is the best rank a Skill reached on one
-- trending board in one period. A row stays after the Skill leaves the board.
--
-- Only an evidenced board row earns one: a post that named the Skill, or a
-- star surge on a repository holding exactly one Skill. Star filler never does.
-- The hourly `record-trending-awards` task writes this table and nothing else.
-- Cull path: drop the task, then `DROP TABLE skill_trending_awards`.
CREATE TABLE IF NOT EXISTS skill_trending_awards (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  -- 'week' or 'month'. The 'all' range ranks by stars, so it awards nothing.
  board TEXT NOT NULL CHECK (board IN ('week', 'month')),
  -- 'YYYY-MM-DD' for the Monday (UTC) that starts a week, 'YYYY-MM' for a month.
  period TEXT NOT NULL,
  -- 1 is the first row on the board.
  best_rank INTEGER NOT NULL CHECK (best_rank >= 1),
  -- Unix seconds of the run that first saw `best_rank`.
  ranked_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo, name, board, period)
) WITHOUT ROWID;

-- The README badge matches owner and repo case-insensitively, as GitHub does.
-- The primary key is binary, so that lookup needs its own index.
CREATE INDEX IF NOT EXISTS idx_skill_trending_awards_repo_nocase
  ON skill_trending_awards (owner COLLATE NOCASE, repo COLLATE NOCASE);
