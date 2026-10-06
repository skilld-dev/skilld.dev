-- A Repository that GitHub renames or transfers moves in the registry too
-- (ADR-0013). Every row moves to the new owner and name, and the old name
-- stays behind as an alias that answers its URLs with a 301.
--
-- GitHub's numeric Repository ID survives every rename and transfer. Sync
-- records it from the same GraphQL read that reports the current name.
ALTER TABLE repos ADD COLUMN repository_id INTEGER;

-- One row per old name. `owner` and `repo` are the old registry identity, and
-- the target is where the Repository lives now. GitHub names compare without
-- case, so these do too.
--
-- A root Skill takes the Repository name, so a move that renames the
-- Repository renames that Skill. `root_skill` keeps the old Skill name and
-- `target_root_skill` the new one, so its old URL redirects as well.
--
-- Cull path: a later move rewrites the target, and a move back deletes the
-- row. Dropping the table ends every redirect, so do not drop it while the
-- old URLs still receive traffic.
CREATE TABLE IF NOT EXISTS repo_aliases (
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  repository_id INTEGER NOT NULL,
  target_owner TEXT NOT NULL COLLATE NOCASE,
  target_repo TEXT NOT NULL COLLATE NOCASE,
  root_skill TEXT,
  target_root_skill TEXT,
  -- Unix seconds the registry first moved the rows to this target.
  moved_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo),
  CHECK ((root_skill IS NULL) = (target_root_skill IS NULL))
);

-- A later move of the target rewrites every alias that points at it.
CREATE INDEX IF NOT EXISTS idx_repo_aliases_target ON repo_aliases (target_owner, target_repo);
