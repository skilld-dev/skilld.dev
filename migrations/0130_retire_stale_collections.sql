-- Retire five stale collections (2026-09-30). Rows stay; readers already
-- filter on `deleted_at IS NULL`, so every listing and the authors sitemap
-- drop them. The URLs answer 301 or 410 (shared/retired-collections.ts).
UPDATE collections_v2
SET deleted_at = CAST(strftime('%s','now') AS INTEGER),
    featured = 0,
    updated_at = CAST(strftime('%s','now') AS INTEGER)
WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw')
  AND deleted_at IS NULL
  AND slug IN (
    'agent-building-stack',
    'agent-workflow-stack',
    'typescript-engineering-stack',
    'apple-apps',
    'knowledge-workspace'
  );
