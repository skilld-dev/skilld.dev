-- Unknown fork status stays unknown until GitHub metadata confirms it.
ALTER TABLE repos ADD COLUMN is_fork INTEGER CHECK (is_fork IN (0, 1));

CREATE TABLE skill_validation_email_deliveries (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'accepted', 'rejected', 'uncertain')),
  attempted_at INTEGER NOT NULL,
  error TEXT
);
