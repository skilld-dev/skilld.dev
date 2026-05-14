-- Indexes targeting the hottest read paths flagged in the D1 read-amplification
-- audit (6.87B reads / 530K writes ratio). All three columns are queried on
-- every skill detail view and on every hourly sync pass; without these the
-- planner falls back to full table scans of the skills table.
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills (slug);
CREATE INDEX IF NOT EXISTS idx_skills_owner_repo ON skills (owner, repo);
CREATE INDEX IF NOT EXISTS idx_skills_last_synced_at ON skills (last_synced_at);
