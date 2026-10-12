-- Stage bounded GitHub star pages before replacing the last usable import.
CREATE TABLE user_starred_import (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  starred_at INTEGER NOT NULL,
  has_skill INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, owner, repo)
);
CREATE TABLE user_starred_import_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  import_id TEXT NOT NULL,
  next_page INTEGER NOT NULL,
  active_partial INTEGER NOT NULL DEFAULT 0
);
