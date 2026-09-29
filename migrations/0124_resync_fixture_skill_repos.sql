-- Sync now ignores SKILL.md files under test and fixture folders
-- (`isRegistrySkillPath` in shared/skill-path.ts). Rows it indexed from those
-- folders before stay resolved until their repository syncs its content
-- again, and an unchanged tree SHA skips that work.
--
-- Clearing the tree cursor sends each affected repository through a full
-- content sync on its next tick. The sync's existing sweep then marks every
-- fixture row `path_missing`, quarantined and noindex, and the resolved Skill
-- count behind the canonical URL drops to the real Skills.
--
-- This statement only picks repositories. The sync decides which rows go, so
-- an over-broad match here costs one extra sync and retires nothing on its own.
-- Measured on 2026-09-29: 180 resolved rows across 36 repositories.
UPDATE repos
SET last_tree_sha = NULL
WHERE (owner, repo) IN (
  SELECT DISTINCT owner, repo
  FROM skills
  WHERE source_resolved = 1
    AND rendered_skill_path IS NOT NULL
    AND (
      '/' || LOWER(rendered_skill_path) LIKE '%/test/%/skill.md'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/tests/%/skill.md'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/\_\_tests\_\_/%/skill.md' ESCAPE '\'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/fixture/%/skill.md'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/fixtures/%/skill.md'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/\_\_fixtures\_\_/%/skill.md' ESCAPE '\'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/e2e/%/skill.md'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/testdata/%/skill.md'
      OR '/' || LOWER(rendered_skill_path) LIKE '%/node\_modules/%/skill.md' ESCAPE '\'
    )
);
