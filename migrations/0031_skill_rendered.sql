-- Persist rendered SKILL.md on the skills row so the detail handler can serve
-- the page from D1 with zero network calls. Populated by syncRepo when a
-- skill is first seen or its tree SHA changes. Refreshed lazily via
-- waitUntil on stale visits.
ALTER TABLE skills ADD COLUMN rendered_skill_path TEXT;
ALTER TABLE skills ADD COLUMN rendered_status TEXT;
ALTER TABLE skills ADD COLUMN rendered_raw TEXT;
ALTER TABLE skills ADD COLUMN rendered_frontmatter TEXT;
ALTER TABLE skills ADD COLUMN rendered_html TEXT;
ALTER TABLE skills ADD COLUMN rendered_at INTEGER;
