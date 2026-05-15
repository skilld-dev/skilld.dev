-- Drop the atproto-era `collections` and `collection_skills` tables. After
-- 0051 the only remaining legacy atproto data was these two, kept because
-- recompute-skill-trust, recompute-skill-indexability, and admin/integrity
-- still read curator counts from them.
--
-- Those readers have now been switched to `collections_v2`/`collection_skills_v2`
-- (which has a `name` column since 0027). Endorsements on the skill detail
-- page were already stubbed to [] in Phase 1.
DROP INDEX IF EXISTS idx_collections_did_updated;
DROP INDEX IF EXISTS idx_collections_updated;
DROP INDEX IF EXISTS idx_collections_alive;
DROP INDEX IF EXISTS idx_collection_skills_lookup;
DROP TABLE IF EXISTS collection_skills;
DROP TABLE IF EXISTS collections;
