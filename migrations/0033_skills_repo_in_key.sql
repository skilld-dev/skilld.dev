-- Make (owner, repo, name) the actual identity of a skill row AND extract
-- repo-level columns to a dedicated `repos` table in one pass.
--
-- Two repos owned by the same GitHub user/org can each publish a SKILL.md
-- with the same directory name (e.g. both vercel-labs/openreview and
-- vercel-labs/agent-skills ship web-design-guidelines). Today the
-- (owner, name) primary key causes every sync cycle to ON CONFLICT-clobber
-- the previous row, flipping `repo`. Loser's URL 404s.
--
-- We also denormalize repo facts (stars, broken_since, last_tree_sha, …)
-- onto every skill row, so per-skill writes for the same repo race and
-- skip-by-tree-sha reads from "first row in a Map iterator". Splitting
-- those onto `repos(owner, repo)` gives one writer per repo and a single
-- source of truth.
--
-- This migration is the destructive core: backfill repos from the
-- pre-shrink skills table, rebuild skills with the new PK and without the
-- moved columns. Indexes / FTS / dependent table rebuilds follow in
-- 0034-0037 to stay under D1's per-migration time budget.

-- 1. Backfill `repos` FIRST (before we lose the moved columns).
CREATE TABLE repos (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  pushed_at INTEGER,
  repo_created_at INTEGER,
  repo_meta_synced_at INTEGER,
  last_tree_sha TEXT,
  repo_kind TEXT NOT NULL DEFAULT 'creator'
    CHECK (repo_kind IN ('creator', 'catalog', 'aggregator')),
  repo_kind_source TEXT NOT NULL DEFAULT 'computed'
    CHECK (repo_kind_source IN ('computed', 'override')),
  repo_skill_count INTEGER NOT NULL DEFAULT 0,
  broken_since INTEGER,
  PRIMARY KEY (owner, repo)
);

-- Per-skill rows for the same repo can disagree (each was a write target
-- before this split); use MAX/MIN for monotonic fields and "latest by
-- last_synced_at" subqueries for fields where only one value is correct.
INSERT INTO repos (
  owner, repo, default_branch, stars, forks, pushed_at, repo_created_at,
  repo_meta_synced_at, last_tree_sha, repo_kind, repo_kind_source,
  repo_skill_count, broken_since
)
SELECT
  s.owner,
  s.repo,
  (SELECT default_branch FROM skills s2
   WHERE s2.owner = s.owner AND s2.repo = s.repo
   ORDER BY COALESCE(s2.last_synced_at, 0) DESC LIMIT 1),
  COALESCE(MAX(s.stars), 0),
  COALESCE(MAX(s.forks), 0),
  MAX(s.pushed_at),
  MIN(s.repo_created_at),
  MAX(s.repo_meta_synced_at),
  (SELECT last_tree_sha FROM skills s2
   WHERE s2.owner = s.owner AND s2.repo = s.repo
   ORDER BY COALESCE(s2.last_synced_at, 0) DESC LIMIT 1),
  COALESCE(
    (SELECT repo_kind FROM skills s2
     WHERE s2.owner = s.owner AND s2.repo = s.repo
     ORDER BY COALESCE(s2.last_synced_at, 0) DESC LIMIT 1),
    'creator'
  ),
  COALESCE(
    (SELECT repo_kind_source FROM skills s2
     WHERE s2.owner = s.owner AND s2.repo = s.repo
     ORDER BY COALESCE(s2.last_synced_at, 0) DESC LIMIT 1),
    'computed'
  ),
  COALESCE(MAX(s.repo_skill_count), 0),
  MIN(s.broken_since)
FROM skills s
GROUP BY s.owner, s.repo;

-- 2. Drop FTS triggers + virtual table (they reference `skills`). They get
-- recreated in 0036.
DROP TRIGGER IF EXISTS skills_ai;
DROP TRIGGER IF EXISTS skills_ad;
DROP TRIGGER IF EXISTS skills_au;
DROP TABLE IF EXISTS skills_fts;

-- 3. Rebuild skills in its final post-extract shape. Explicit column list:
-- local and remote diverged in column order over time (ALTER TABLE
-- history), so `SELECT *` would map positionally and feed wrong values
-- into NOT NULL columns.
CREATE TABLE skills_new (
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  display_name TEXT NOT NULL,
  installs INTEGER NOT NULL DEFAULT 0,
  slug TEXT NOT NULL,
  description TEXT,
  current_sha TEXT,
  modified_at INTEGER,
  first_seen_at INTEGER,
  references_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER,
  sync_status TEXT,
  is_abstract INTEGER,
  target_package TEXT,
  abstractness_category TEXT,
  is_official INTEGER NOT NULL DEFAULT 0,
  source_resolved INTEGER NOT NULL DEFAULT 0,
  curator_count INTEGER NOT NULL DEFAULT 0,
  curator_reason_count INTEGER NOT NULL DEFAULT 0,
  approved_social_count INTEGER NOT NULL DEFAULT 0,
  author_social_count INTEGER NOT NULL DEFAULT 0,
  seo_index_score INTEGER NOT NULL DEFAULT 0,
  seo_indexable INTEGER NOT NULL DEFAULT 0,
  seo_index_reasons TEXT NOT NULL DEFAULT '[]',
  seo_index_synced_at INTEGER,
  trust_tier TEXT NOT NULL DEFAULT 'untrusted',
  trust_source TEXT NOT NULL DEFAULT 'computed',
  trust_score INTEGER NOT NULL DEFAULT 0,
  trust_reasons TEXT NOT NULL DEFAULT '[]',
  trust_synced_at INTEGER,
  assets TEXT NOT NULL DEFAULT '[]',
  rendered_skill_path TEXT,
  rendered_status TEXT,
  rendered_raw TEXT,
  rendered_frontmatter TEXT,
  rendered_html TEXT,
  rendered_at INTEGER,
  PRIMARY KEY (owner, repo, name)
);

INSERT INTO skills_new (
  name, owner, repo, display_name, installs, slug, description,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, is_abstract, target_package,
  abstractness_category, is_official, source_resolved,
  curator_count, curator_reason_count, approved_social_count,
  author_social_count, seo_index_score, seo_indexable,
  seo_index_reasons, seo_index_synced_at, trust_tier, trust_source,
  trust_score, trust_reasons, trust_synced_at, assets,
  rendered_skill_path, rendered_status, rendered_raw,
  rendered_frontmatter, rendered_html, rendered_at
)
SELECT
  name, owner, repo, display_name, installs, slug, description,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, is_abstract, target_package,
  abstractness_category, is_official, source_resolved,
  curator_count, curator_reason_count, approved_social_count,
  author_social_count, seo_index_score, seo_indexable,
  seo_index_reasons, seo_index_synced_at, trust_tier, trust_source,
  trust_score, trust_reasons, trust_synced_at, assets,
  rendered_skill_path, rendered_status, rendered_raw,
  rendered_frontmatter, rendered_html, rendered_at
FROM skills;

DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;
