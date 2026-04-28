-- Social posts (X/Twitter, Bluesky, Reddit) referencing a skill.
--   role 'author'    = post by the skill's owner/maintainer
--   role 'community' = post by anyone else mentioning the skill
-- text_extract gives crawlers an indexable quote even before the embed
-- widget JS hydrates client-side. reddit_kind separates submission posts
-- from comment permalinks; subreddit is captured for filtering/SEO.
CREATE TABLE IF NOT EXISTS skill_social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_slug TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'bsky', 'reddit')),
  post_url TEXT NOT NULL,
  post_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_display_name TEXT,
  author_avatar TEXT,
  role TEXT NOT NULL CHECK (role IN ('author', 'community')),
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
  UNIQUE (skill_slug, platform, post_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_social_lookup
  ON skill_social_posts (skill_slug, status, role, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_social_queue
  ON skill_social_posts (status, fetched_at DESC);
