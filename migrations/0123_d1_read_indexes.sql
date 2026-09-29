-- Indexes for the heaviest D1 reads outside the scheduled-run watchdog.
--
-- skilld-db read 16.6B rows in September 2026, against a 25B monthly
-- allowance. Figures below are rows read per call, measured with workerd's D1
-- `meta.rows_read` on a copy of production data with production planner stats.
--
-- idx_skills_category_members: the category arm of `clusterMembersSql`
-- (`cluster-membership.ts`) filters on
-- `abstractness_category IN (...) AND (is_abstract = 1 OR seo_indexable = 1)`.
-- No index led with the category, so SQLite scanned every repo and joined
-- skills to it. The WHERE clause of this partial index must stay textually
-- equal to the query's filter, or SQLite ignores the index.
-- `/skills/<slug>` count: 14.8K to 0.3K rows for coding.
--
-- idx_skills_owner_name_key: the pinned arm of the same query matches
-- `s.owner || '/' || s.name IN (...)`, which scanned all of `skills`. The
-- expression matches the query without the table alias, as in migration 0092.
-- Pinned homepage query: 15.4K to 1.2K rows.
--
-- idx_skills_owner_nocase: the community directory joins
-- `skills.owner = users.login COLLATE NOCASE`, and `/api/users/<login>/skills`
-- filters `owner = ? COLLATE NOCASE`. A binary index cannot serve a NOCASE
-- comparison, so each user scanned `skills` in full.
-- Community directory: 422K to 2.2K rows. User Skills: 29K to 0.3K rows.
--
-- idx_activity_skill_latest: `/api/feed/recent-updates` reads the newest
-- `skill_updated` row of each official abstract skill. The index returns that
-- row with one seek per skill. The query also runs without this index, at
-- about 4.5K rows instead of 2K.
--
-- idx_skill_generated_kind: tag facet counts read only `kind = 'tags'` rows,
-- about an eighth of the table. Tag facet counts: 66K to 49K rows.
CREATE INDEX IF NOT EXISTS idx_skills_category_members
  ON skills(abstractness_category)
  WHERE is_abstract = 1 OR seo_indexable = 1;

CREATE INDEX IF NOT EXISTS idx_skills_owner_name_key
  ON skills((owner || '/' || name));

CREATE INDEX IF NOT EXISTS idx_skills_owner_nocase
  ON skills(owner COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_activity_skill_latest
  ON activity(type, owner, repo, name, occurred_at);

CREATE INDEX IF NOT EXISTS idx_skill_generated_kind
  ON skill_generated(kind);
