ALTER TABLE skills ADD COLUMN broken_since INTEGER;

CREATE INDEX IF NOT EXISTS idx_skills_broken ON skills (broken_since);
