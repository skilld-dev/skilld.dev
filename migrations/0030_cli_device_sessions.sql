CREATE TABLE cli_device_sessions (
  device_code TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  cli_version TEXT,
  machine_hint TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','authorized','expired','denied')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  authorized_at INTEGER
);

CREATE INDEX idx_device_user_code ON cli_device_sessions(user_code) WHERE status = 'pending';
