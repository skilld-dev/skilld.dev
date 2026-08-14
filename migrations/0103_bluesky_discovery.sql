-- Bluesky as a second discovery source.
--
-- WHY A SECOND SOURCE AT ALL, GIVEN THE VOLUME.
-- Measured over 30 days: X carries ~250 repo-bearing posts/day, Bluesky ~2.
-- Bluesky is not a volume play. It is a different population. The repos it
-- surfaced in that window (kepano/obsidian-skills, pixeline/atproto-oauth,
-- stephenabbott/bods-skill, aubrika/sitting-together) are small, personal,
-- single-author skill repos that never clear X's popularity bar. That is
-- exactly the curated tail `brand-guidelines.md` says the registry wants, and
-- the source costs nothing: the AppView answers search without a token, and
-- with an app password it is still free.
--
-- WHY THE SAME TABLES.
-- Everything downstream of the client is already platform-neutral: repo
-- extraction, the ledger, skill verification, the size guard. Only the fetch
-- differs. A parallel set of bsky_* tables would fork all of that to gain
-- nothing, so posts from both platforms land in one set of tables with a
-- `platform` discriminator.

-- Which network a post came from. Defaults to 'x' so every existing row is
-- correctly labelled without a backfill.
--
-- No collision risk on the shared primary key: an X id is a decimal snowflake
-- and a Bluesky id is an AT-URI (at://did:plc:.../app.bsky.feed.post/...), so
-- the two id spaces cannot overlap.
ALTER TABLE x_posts ADD COLUMN platform TEXT NOT NULL DEFAULT 'x'
  CHECK (platform IN ('x', 'bsky'));

-- The refresh task's claim query, now platform-scoped.
--
-- THIS INDEX IS LOAD-BEARING, NOT AN OPTIMISATION. `refresh-x-engagement`
-- claims due rows and posts their ids to the X lookup endpoint. Without the
-- platform predicate it would claim Bluesky rows and send AT-URIs to X, which
-- charges cap for a guaranteed miss and never clears the row.
DROP INDEX IF EXISTS idx_x_posts_refresh;
CREATE INDEX idx_x_posts_refresh ON x_posts (platform, refresh_tier, next_refresh_at)
  WHERE refresh_tier != 'frozen';

-- SQLite cannot alter a CHECK constraint, so `source` is widened by rebuild.
-- Column list mirrors 0097 plus the two columns 0101 added.
CREATE TABLE discovery_ledger_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('x', 'hn', 'bsky')),
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  evidence_url TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  evidence_score INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'indexed', 'empty', 'rejected')),
  submitted_at INTEGER,
  announced_at INTEGER,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  review_note TEXT,
  skill_count INTEGER,
  held_reason TEXT,
  UNIQUE (source, owner, repo)
);

INSERT INTO discovery_ledger_new (
  id, source, owner, repo, evidence_url, evidence_text, evidence_score,
  first_seen_at, last_seen_at, mention_count, status, submitted_at,
  announced_at, reviewed_at, reviewed_by, review_note, skill_count, held_reason
)
SELECT
  id, source, owner, repo, evidence_url, evidence_text, evidence_score,
  first_seen_at, last_seen_at, mention_count, status, submitted_at,
  announced_at, reviewed_at, reviewed_by, review_note, skill_count, held_reason
FROM discovery_ledger;

DROP TABLE discovery_ledger;
ALTER TABLE discovery_ledger_new RENAME TO discovery_ledger;

-- Indexes do not survive the rebuild; recreate every one from 0097 and 0101.
--
-- `idx_discovery_ledger_source_rank` is new. Bluesky engagement lives on a
-- different scale and must never be ranked against X in one list: on X a
-- trending post clears several thousand weighted points, while on Bluesky the
-- highest-scoring post in a 30-day window scored 20 and the median repo-bearing
-- post scored 0. The submit path now ranks within each source and interleaves,
-- so a Bluesky row is never starved by an X row it cannot outscore. This index
-- is what makes that per-source ranking affordable.
CREATE INDEX idx_discovery_ledger_status
  ON discovery_ledger (status, evidence_score DESC, last_seen_at DESC);
CREATE INDEX idx_discovery_ledger_repo ON discovery_ledger (owner, repo);
CREATE INDEX idx_discovery_ledger_submittable
  ON discovery_ledger (evidence_score DESC, last_seen_at DESC)
  WHERE status = 'pending' AND held_reason IS NULL;
CREATE INDEX idx_discovery_ledger_held
  ON discovery_ledger (skill_count DESC)
  WHERE held_reason IS NOT NULL;
CREATE INDEX idx_discovery_ledger_source_rank
  ON discovery_ledger (source, evidence_score DESC, last_seen_at DESC)
  WHERE status = 'pending' AND held_reason IS NULL;
