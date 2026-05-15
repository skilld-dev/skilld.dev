-- Dirty-queue for skill counter coherence. UI/API writes that change the
-- live values behind the denormalized counters on `skills`
-- (curator_count, curator_reason_count, approved_social_count,
-- author_social_count) enqueue (owner, repo, name, reason) rows here. A
-- 5-minute scheduled task drains the queue and recomputes the four columns
-- from live counts (see layers/registry/server/tasks/drain-skill-dirty.ts).
--
-- Re-enqueues use INSERT OR REPLACE so the most recent queued_at wins; the
-- primary key collapses duplicates per (skill, reason).
CREATE TABLE IF NOT EXISTS skill_dirty (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  reason TEXT NOT NULL, -- 'curator' | 'social' | other
  queued_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, repo, name, reason)
);

CREATE INDEX IF NOT EXISTS idx_skill_dirty_queued ON skill_dirty(queued_at);
