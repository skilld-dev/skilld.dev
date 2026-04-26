-- Extend skills with revision-tracking + sync-status columns.
-- last_tree_sha denormalized across rows in a repo so the sync worker
-- can short-circuit a tree walk by reading any row in (owner, repo).
ALTER TABLE skills ADD COLUMN current_sha TEXT;
ALTER TABLE skills ADD COLUMN modified_at INTEGER;
ALTER TABLE skills ADD COLUMN first_seen_at INTEGER;
ALTER TABLE skills ADD COLUMN references_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN last_synced_at INTEGER;
ALTER TABLE skills ADD COLUMN sync_status TEXT;
ALTER TABLE skills ADD COLUMN last_tree_sha TEXT;

CREATE INDEX IF NOT EXISTS idx_skills_modified ON skills (modified_at DESC);
