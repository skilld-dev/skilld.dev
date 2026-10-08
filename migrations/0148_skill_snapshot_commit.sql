-- Pin legacy snapshots to their recorded Skill revision until the next sync.
ALTER TABLE skills ADD COLUMN rendered_commit_sha TEXT;

UPDATE skills SET rendered_commit_sha = (
  SELECT sr.sha FROM skill_revisions sr
  WHERE sr.owner = skills.owner AND sr.repo = skills.repo AND sr.name = skills.name
  ORDER BY sr.modified_at DESC LIMIT 1
);

-- Revisit root Skills so their supporting files enter the stored inventory.
UPDATE repos SET last_tree_sha = NULL, pushed_at = NULL
WHERE EXISTS (
  SELECT 1 FROM skills s
  WHERE s.owner = repos.owner AND s.repo = repos.repo AND s.rendered_skill_path = 'SKILL.md'
);
