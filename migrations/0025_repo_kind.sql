-- Discriminate the kind of repo a skill comes from.
--   creator    : <= 5 skills. Long-tail, individual maintainers. Loop 1 detail-page surface.
--   catalog    : 6-100 skills. Curated developer toolkits / org-scale skill packs. Loop 1 + 2 sweet spot.
--   aggregator : > 100 skills. Awesome-list republishers; usually duplicate canonical skills.
--                Excluded from anonymous discovery; Loop 2 digest must default-mute / collapse.
ALTER TABLE skills ADD COLUMN repo_kind TEXT NOT NULL DEFAULT 'creator'
  CHECK (repo_kind IN ('creator', 'catalog', 'aggregator'));

-- Recompute repo_skill_count from current state (stale after the 30k-row purge).
-- UPDATE FROM with a precomputed aggregate avoids O(n^2) correlated subquery.
UPDATE skills
SET repo_skill_count = c.n
FROM (SELECT owner, repo, COUNT(*) AS n FROM skills GROUP BY owner, repo) AS c
WHERE skills.owner = c.owner AND skills.repo = c.repo;

UPDATE skills
SET repo_kind = CASE
  WHEN repo_skill_count > 100 THEN 'aggregator'
  WHEN repo_skill_count > 5 THEN 'catalog'
  ELSE 'creator'
END;

CREATE INDEX IF NOT EXISTS idx_skills_repo_kind
  ON skills (repo_kind, trust_tier, stars DESC);
