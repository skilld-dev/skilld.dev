-- Indexes for the two same-repo reads behind every uncached Skill page.
--
-- On 2026-09-29 a crawler rendered 392 uncached Skill pages in two minutes and
-- D1 answered "overloaded". 69% of D1 time in that burst was one query: the
-- same-repo list in `findRelatedSkills` (`skills-registry.ts`), which filters
-- on (owner, repo) and orders by `modified_at DESC, name`. The primary key
-- (owner, repo, name) found the rows but not in that order, so SQLite read
-- every Skill of the repository and sorted them in a temp B-tree to keep six.
--
-- idx_skills_repo_recent: returns the repository's Skills already in that
-- order, so the query stops after the first rows that pass its filters.
-- EXPLAIN QUERY PLAN loses `USE TEMP B-TREE FOR ORDER BY` for the inner query.
--
-- idx_skills_repo_resolved: the resolved-Skill count
-- (`owner = ? AND repo = ? AND source_resolved = 1`) runs on the detail and the
-- related route of every Skill page. This index answers it without reading
-- the table rows (a covering index search).
CREATE INDEX IF NOT EXISTS idx_skills_repo_recent
  ON skills(owner, repo, modified_at DESC, name);

CREATE INDEX IF NOT EXISTS idx_skills_repo_resolved
  ON skills(owner, repo, source_resolved);
