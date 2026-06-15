-- Curated indexability decisions for AI-derived tags.
-- The blunt ">=10 skills" threshold let ~387 thin, AI-generated tag pages into
-- the sitemap (scaled-content surface that Google's quality classifier
-- punishes). This table is the source of truth for which derived tags earn an
-- indexable page: a sub-agent audit ticks/crosses each candidate, decisions
-- sync here, and the sitemap + tag-page robots read `keep`.
--
-- Controlled-vocab tags (taxonomy.ts) are trusted and bypass this table.
-- Derived tags absent from this table render (if they pass the existence gate)
-- but are noindex + excluded from the sitemap.
CREATE TABLE tag_decisions (
  slug TEXT PRIMARY KEY,
  keep INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  reason TEXT,
  skill_count INTEGER,
  audited_at INTEGER
);
