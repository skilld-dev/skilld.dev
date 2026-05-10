ALTER TABLE collection_skills_v2 ADD COLUMN name TEXT;

CREATE INDEX IF NOT EXISTS idx_collection_skills_v2_skill
  ON collection_skills_v2(owner, repo, name);
