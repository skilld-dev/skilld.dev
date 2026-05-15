-- Drop atproto-era tables that have no remaining live references after the
-- identity-is-github-login migration. The legacy `/people/*` namespace and
-- atproto handles are gone (see CLAUDE.md two-loop product model).
--
-- Audit (2026-05-15):
--   * `curators`              — no TS/Vue/SQL references
--   * `follows_cache`         — no TS/Vue/SQL references
--   * `follows_refresh_state` — no TS/Vue/SQL references
--
-- NOT dropped here (still wired in):
--   * `collections` / `collection_skills` — still read by recompute-skill-trust,
--     recompute-skill-indexability, and admin/integrity for curator counts.
--     Migrate those readers to `collections_v2`/`collection_skills_v2` before
--     dropping. Stub: SkillDetail endorsements already returns []; recompute
--     scripts and integrity dashboard are next.
--   * `install_events` — still written by /api/events/install (kept for the
--     `handle` legacy column; can be reshaped after backfill plan).
DROP TABLE IF EXISTS follows_refresh_state;
DROP TABLE IF EXISTS follows_cache;
DROP TABLE IF EXISTS curators;
