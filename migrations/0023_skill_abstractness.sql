-- Denormalise abstractness classifier output onto `skills` for fast homepage queries.
-- Source of truth remains `skill_generated(kind='abstractness')`; these columns
-- are a derived, queryable cache.
--
-- is_abstract: 0 = package-specific, 1 = abstract, NULL = unclassified
-- target_package: normalised package slug for package-specific skills
-- abstractness_category: free-text category from the classifier (e.g. 'planning')
ALTER TABLE skills ADD COLUMN is_abstract INTEGER;
ALTER TABLE skills ADD COLUMN target_package TEXT;
ALTER TABLE skills ADD COLUMN abstractness_category TEXT;

UPDATE skills
SET
  is_abstract = CASE
    WHEN json_extract(g.payload, '$.kind') = 'abstract' THEN 1
    WHEN json_extract(g.payload, '$.kind') = 'package-specific' THEN 0
    ELSE NULL
  END,
  target_package = json_extract(g.payload, '$.package'),
  abstractness_category = json_extract(g.payload, '$.category')
FROM skill_generated g
WHERE g.kind = 'abstractness'
  AND g.owner = skills.owner
  AND g.name = skills.name;

CREATE INDEX IF NOT EXISTS idx_skills_abstract_category
  ON skills (is_abstract, abstractness_category, installs DESC);

CREATE INDEX IF NOT EXISTS idx_skills_target_package
  ON skills (target_package, installs DESC)
  WHERE target_package IS NOT NULL;
