-- Retire two stale collections (2026-09-30). Rows stay; readers already
-- filter on `deleted_at IS NULL`, so every listing and the authors sitemap
-- drop them. The URLs answer 410 (shared/retired-collections.ts). The
-- `-stack` trio stays live and featured: the homepage band and curator
-- signals depend on it.
UPDATE collections_v2
SET deleted_at = CAST(strftime('%s','now') AS INTEGER),
    featured = 0,
    updated_at = CAST(strftime('%s','now') AS INTEGER)
WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw')
  AND deleted_at IS NULL
  AND slug IN (
    'apple-apps',
    'knowledge-workspace'
  );
