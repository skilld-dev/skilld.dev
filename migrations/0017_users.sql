-- Phase 2: users table for GitHub-OAuth identity.
-- Token (github_token_encrypted) is AES-GCM ciphertext keyed by NUXT_TOKEN_KEY.
-- Scopes stored alongside so re-OAuth detects upgrades (e.g. read:user -> repo).
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER UNIQUE NOT NULL,
  login TEXT NOT NULL,
  name TEXT,
  email TEXT,
  digest_email TEXT,
  digest_email_pending TEXT,
  digest_email_token_hash TEXT,
  digest_email_token_expires_at INTEGER,
  avatar TEXT,
  github_token_encrypted TEXT,
  github_token_scopes TEXT,
  stars_synced_at INTEGER,
  email_opt_in INTEGER NOT NULL DEFAULT 0,
  digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('weekly','daily','off')),
  digest_dow INTEGER DEFAULT 1,
  digest_hour INTEGER NOT NULL DEFAULT 9,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  onboarded_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE INDEX idx_users_login ON users(login);
