-- A welcome is explicitly requested once. It never enrolls an existing account.
CREATE TABLE welcome_email_deliveries (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'accepted', 'rejected', 'uncertain', 'cancelled')),
  recipient TEXT,
  consented_at INTEGER,
  attempted_at INTEGER NOT NULL,
  attempt_id TEXT NOT NULL,
  unsubscribed_at INTEGER,
  message_id TEXT,
  error TEXT
);
