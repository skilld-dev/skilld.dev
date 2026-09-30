-- SEO experiment (2026-09-30, gate 2026-11-11): a Skill page is indexable only
-- if it has appeared on a trending board. This table is the admitted set.
--
-- Additive on purpose. Trending boards change every week, and a page that
-- flips between index and noindex confuses Google. A row stays until the gate.
-- Cull path: `DELETE FROM skill_trending_admissions;` then remove the
-- admission condition in `trending-admission.ts` to restore the old rule.
CREATE TABLE IF NOT EXISTS skill_trending_admissions (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Unix seconds of the first sighting on any board.
  admitted_at INTEGER NOT NULL,
  -- The board that first admitted it: 'week', 'month' or 'all'.
  first_board TEXT NOT NULL CHECK (first_board IN ('week', 'month', 'all')),
  PRIMARY KEY (owner, repo, name)
) WITHOUT ROWID;
