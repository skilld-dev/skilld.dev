-- Extend skill_social_posts to support ingestion from new platforms ('hn',
-- 'github-ref') and add a dedup unique key on (platform, post_url). The
-- original CHECK constraint on `platform` only permitted twitter/bsky/reddit
-- and the `role` column was NOT NULL CHECK in ('author','community'), which
-- is too strict for automated ingestion where role attribution is unknown
-- at write-time. Rebuild the table to widen both CHECKs and add the new
-- unique key.

PRAGMA foreign_keys = OFF;

CREATE TABLE skill_social_posts__new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_slug TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'bsky', 'reddit', 'hn', 'github-ref')),
  post_url TEXT NOT NULL,
  post_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_display_name TEXT,
  author_avatar TEXT,
  role TEXT NOT NULL DEFAULT 'community' CHECK (role IN ('author', 'community')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  text_extract TEXT NOT NULL,
  title TEXT,
  oembed_html TEXT,
  bsky_uri TEXT,
  bsky_cid TEXT,
  subreddit TEXT,
  reddit_kind TEXT CHECK (reddit_kind IN ('post', 'comment')),
  score INTEGER,
  posted_at INTEGER,
  fetched_at INTEGER NOT NULL,
  approved_by TEXT,
  approved_at INTEGER,
  UNIQUE (skill_slug, platform, post_id),
  UNIQUE (skill_slug, platform, post_url)
);

INSERT INTO skill_social_posts__new (
  id, skill_slug, platform, post_url, post_id, author_handle, author_display_name,
  author_avatar, role, status, text_extract, title, oembed_html, bsky_uri, bsky_cid,
  subreddit, reddit_kind, score, posted_at, fetched_at, approved_by, approved_at
)
SELECT
  id, skill_slug, platform, post_url, post_id, author_handle, author_display_name,
  author_avatar, role, status, text_extract, title, oembed_html, bsky_uri, bsky_cid,
  subreddit, reddit_kind, score, posted_at, fetched_at, approved_by, approved_at
FROM skill_social_posts;

DROP INDEX IF EXISTS idx_skill_social_lookup;
DROP INDEX IF EXISTS idx_skill_social_queue;
DROP TABLE skill_social_posts;
ALTER TABLE skill_social_posts__new RENAME TO skill_social_posts;

CREATE INDEX idx_skill_social_lookup
  ON skill_social_posts (skill_slug, status, role, posted_at DESC);

CREATE INDEX idx_skill_social_queue
  ON skill_social_posts (status, fetched_at DESC);

PRAGMA foreign_keys = ON;
