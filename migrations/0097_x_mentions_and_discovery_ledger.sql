-- Trending discovery from X (Twitter).
--
-- Three tables, each with one job:
--
--   x_posts          One row per X post that references a tracked GitHub repo
--                    or a skilld.dev URL. Repo-grained, not skill-grained:
--                    a post links `github.com/<owner>/<repo>`, it does not
--                    name an individual skill. `skill_social_posts` stays as
--                    the skill-grained display table for approved proof.
--
--   x_post_metrics   Append-only engagement snapshots. Trending is a velocity
--                    measure, so a single current count is not enough; we need
--                    at least two observations to compute a delta. Snapshots
--                    are pruned by `prune_after` rather than kept forever.
--
--   discovery_ledger One row per (source, owner, repo) discovered from an
--                    external signal and awaiting or having passed review.
--                    Shared by X and HN so the review surface is one list.
--
-- NOTE ON VOCABULARY: `like` already means the skilld user primitive
-- (`skill_likes`, ADR-0003). X engagement columns are therefore named
-- `favourite_count` / `repost_count` / `bookmark_count`, never `like_count`,
-- so a join across the two never reads ambiguously.

CREATE TABLE x_posts (
  -- The X post id (snowflake). Text, because it exceeds 2^53 and JS would
  -- silently round it as a number.
  post_id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_name TEXT,
  author_followers INTEGER NOT NULL DEFAULT 0,
  text_extract TEXT NOT NULL,
  lang TEXT,
  posted_at INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  -- Latest observed engagement, denormalized from the newest x_post_metrics
  -- row so ranking queries never have to window over the snapshot table.
  favourite_count INTEGER NOT NULL DEFAULT 0,
  repost_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  quote_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  impression_count INTEGER NOT NULL DEFAULT 0,
  metrics_updated_at INTEGER NOT NULL,
  -- 'hot'    refresh engagement on the fast tier
  -- 'warm'   slow tier
  -- 'frozen' never refresh again; it no longer moves and each read costs cap
  refresh_tier TEXT NOT NULL DEFAULT 'hot' CHECK (refresh_tier IN ('hot', 'warm', 'frozen')),
  next_refresh_at INTEGER NOT NULL
);

-- The refresh task's claim query: cheapest tier-ordered scan of what is due.
CREATE INDEX idx_x_posts_refresh ON x_posts (refresh_tier, next_refresh_at)
  WHERE refresh_tier != 'frozen';
CREATE INDEX idx_x_posts_posted_at ON x_posts (posted_at DESC);

-- Join table: one post can reference several repos (a thread listing five
-- skill repos is common), and one repo accrues many posts.
CREATE TABLE x_post_repos (
  post_id TEXT NOT NULL REFERENCES x_posts(post_id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  -- 'link'  the post linked github.com/<owner>/<repo>
  -- 'skilld' the post linked a skilld.dev page for this repo
  match_kind TEXT NOT NULL CHECK (match_kind IN ('link', 'skilld')),
  PRIMARY KEY (post_id, owner, repo)
);

CREATE INDEX idx_x_post_repos_repo ON x_post_repos (owner, repo);

CREATE TABLE x_post_metrics (
  post_id TEXT NOT NULL REFERENCES x_posts(post_id) ON DELETE CASCADE,
  observed_at INTEGER NOT NULL,
  favourite_count INTEGER NOT NULL,
  repost_count INTEGER NOT NULL,
  reply_count INTEGER NOT NULL,
  quote_count INTEGER NOT NULL,
  bookmark_count INTEGER NOT NULL,
  impression_count INTEGER NOT NULL,
  PRIMARY KEY (post_id, observed_at)
);

CREATE INDEX idx_x_post_metrics_observed ON x_post_metrics (observed_at);

-- The review ledger. HN ingestion is retrofitted onto this table so that
-- "what did the internet surface that we have not looked at yet" is one
-- query against one list, whatever the source.
CREATE TABLE discovery_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('x', 'hn')),
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  -- Denormalized pointer to the strongest single piece of evidence, so the
  -- review list renders without joining back to the source tables.
  evidence_url TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  evidence_score INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 1,
  -- 'pending'   discovered, not yet submitted to the registry
  -- 'submitted' registry/repository-submission job enqueued
  -- 'indexed'   the repo resolved to at least one skill
  -- 'empty'     submission ran and the repo holds no skills
  -- 'rejected'  a human said no; never resubmit
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'indexed', 'empty', 'rejected')),
  submitted_at INTEGER,
  -- Set once a Discord announcement has gone out for this repo, so a repo
  -- that keeps trending is not re-announced on every cycle.
  announced_at INTEGER,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  review_note TEXT,
  UNIQUE (source, owner, repo)
);

-- The review surface: oldest unreviewed first, strongest evidence first.
CREATE INDEX idx_discovery_ledger_status
  ON discovery_ledger (status, evidence_score DESC, last_seen_at DESC);
-- "is this repo already known to discovery", asked once per ingested mention.
CREATE INDEX idx_discovery_ledger_repo ON discovery_ledger (owner, repo);

-- Cursor state for the polling ingest. A single row; `since_id` makes each
-- post cost exactly one read against the monthly cap no matter how often the
-- task runs, which is what keeps poll frequency decoupled from API spend.
CREATE TABLE x_ingest_cursor (
  query_key TEXT PRIMARY KEY,
  since_id TEXT,
  last_run_at INTEGER,
  last_result_count INTEGER NOT NULL DEFAULT 0,
  -- Running total of posts read, so cap consumption is observable in-app
  -- instead of only via the X usage endpoint.
  posts_read_total INTEGER NOT NULL DEFAULT 0
);
