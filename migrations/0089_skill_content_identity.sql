-- Canonical duplicate claims require exact SKILL.md content identity.
-- Existing rows are backfilled by reconcile-rendered through forced repo syncs.
ALTER TABLE skills ADD COLUMN rendered_raw_sha256 TEXT
  CHECK (rendered_raw_sha256 IS NULL OR length(rendered_raw_sha256) = 64);

CREATE INDEX idx_skills_rendered_raw_sha256
ON skills (rendered_raw_sha256)
WHERE rendered_raw_sha256 IS NOT NULL AND seo_indexable = 1;
