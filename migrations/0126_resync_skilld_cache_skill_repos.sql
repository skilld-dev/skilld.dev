-- Sync no longer admits skilld cache Skills (`isSkilldCacheSkill` in
-- shared/skill-path.ts): a SKILL.md that skilld v2 generated for a dependency
-- and that links the gitignored `.skilld/` folder. Rows indexed from those
-- files stay resolved until their repository syncs its content again.
--
-- Two cursors hold them in place. An unchanged tree SHA skips the content
-- sync, and an unchanged blob SHA skips the content read. Clearing both sends
-- each file through the predicate. The sync then leaves its name unseen, and
-- the existing sweep marks the row `path_missing`, quarantined and noindex.
--
-- These statements only pick rows. The sync decides which rows go, so an
-- over-broad match here costs one extra blob read and retires nothing.
-- Measured on 2026-09-29: 8 resolved rows, 3 in nuxt/scripts and 5 in
-- skilld-dev/skilld.
UPDATE repos
SET last_tree_sha = NULL
WHERE (owner, repo) IN (
  SELECT DISTINCT owner, repo
  FROM skills
  WHERE source_resolved = 1
    AND (
      instr(rendered_raw, '](./.skilld/') > 0
      OR instr(rendered_raw, '](.skilld/') > 0
    )
);

UPDATE skills
SET current_sha = NULL
WHERE source_resolved = 1
  AND (
    instr(rendered_raw, '](./.skilld/') > 0
    OR instr(rendered_raw, '](.skilld/') > 0
  );
