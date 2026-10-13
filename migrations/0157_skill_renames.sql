-- A Skill whose folder an author renames follows the rename (ADR-0017). One
-- sync that loses a Skill and gains another with a near-identical SKILL.md
-- body moves the old Skill's rows to the new name, and the old name stays
-- behind as an alias that answers its URLs with a 301.
--
-- One row per old name, inside one Repository. `name` is the old registry
-- Skill name and `target_name` the Skill it became. Registry names compare
-- without case, so these do too.
--
-- Cull path: a later rename rewrites the target, and a rename back deletes
-- the row. Dropping the table ends every redirect, so do not drop it while
-- the old URLs still receive traffic.
CREATE TABLE IF NOT EXISTS skill_aliases (
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL COLLATE NOCASE,
  target_name TEXT NOT NULL COLLATE NOCASE,
  -- Unix seconds the registry first renamed the Skill to this target.
  renamed_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo, name),
  CHECK (name <> target_name)
);

-- A later rename of the target rewrites every alias that points at it.
CREATE INDEX IF NOT EXISTS idx_skill_aliases_target ON skill_aliases (owner, repo, target_name);
