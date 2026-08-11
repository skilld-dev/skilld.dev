ALTER TABLE repo_sync_progress
ADD COLUMN total_skills INTEGER
CHECK (total_skills IS NULL OR total_skills >= 0);
