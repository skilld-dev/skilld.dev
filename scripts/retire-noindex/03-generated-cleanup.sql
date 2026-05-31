-- Drop generated rows orphaned by the skills swap (the ~198 non-indexable ones).
-- Run AFTER 01-skills-swap.sql.
DELETE FROM skill_generated
WHERE NOT EXISTS (
  SELECT 1 FROM skills s
  WHERE s.owner = skill_generated.owner
    AND s.repo = skill_generated.repo
    AND s.name = skill_generated.name
);
