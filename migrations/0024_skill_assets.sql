-- Stores bundled file paths next to SKILL.md (relative to the skill directory).
-- JSON array of { path, size, type }. Empty array if none.
ALTER TABLE skills ADD COLUMN assets TEXT NOT NULL DEFAULT '[]';
