CREATE TABLE IF NOT EXISTS curators (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  display_name TEXT,
  avatar TEXT,
  collection_count INTEGER NOT NULL DEFAULT 0,
  first_published TEXT NOT NULL,
  last_published TEXT NOT NULL,
  labels TEXT NOT NULL DEFAULT '[]',
  last_profile_refresh TEXT
);

CREATE INDEX IF NOT EXISTS idx_curators_last_published ON curators (last_published DESC);
CREATE INDEX IF NOT EXISTS idx_curators_handle ON curators (handle);
