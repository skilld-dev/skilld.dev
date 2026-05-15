-- Move repo-level facts off `skills` and onto a dedicated `repos` table.
--
-- Today `skills` carries `stars`, `forks`, `pushed_at`, `repo_created_at`,
-- `default_branch`, `repo_meta_synced_at`, `last_tree_sha`, `repo_kind`,
-- `repo_kind_source`, `repo_skill_count`, and `broken_since` on every skill
-- row. That's per-repo data denormalized N times — sync writes them per-skill
-- (so the rows can disagree) and the `skipped-tree-sha` skip-logic reads
-- "first row in a Map" non-deterministically. Splitting them into `repos`
-- gives a single writer per (owner, repo) and a single source of truth.
--
-- `installs` stays on `skills` (per-skill). `is_official`, `trust_*`,
-- `seo_*`, `assets`, rendered_* stay on `skills`. `broken_since` moves to
-- `repos` since broken-ness is a repo property.

-- ---------------------------------------------------------------------------
-- 1. Create the `repos` table
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Backfill from `skills`. Per-skill rows for the same repo can disagree,
-- so use MAX/MIN for monotonic fields and a "latest by last_synced_at"
-- subquery for fields where only one value can be right at a time.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Rebuild `skills` without the moved columns
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS skills_ai;
DROP TRIGGER IF EXISTS skills_ad;
DROP TRIGGER IF EXISTS skills_au;
DROP TABLE IF EXISTS skills_fts;

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

-- Indexes that survive (stars / broken_since / repo_kind moved to repos)
CREATE INDEX idx_skills_installs ON skills (installs DESC);
CREATE INDEX idx_skills_owner ON skills (owner);
CREATE INDEX idx_skills_modified ON skills (modified_at DESC);
CREATE INDEX idx_skills_abstract_category
  ON skills (is_abstract, abstractness_category, installs DESC);
CREATE INDEX idx_skills_target_package
  ON skills (target_package, installs DESC)
  WHERE target_package IS NOT NULL;
CREATE INDEX idx_skills_slug ON skills (slug);
CREATE INDEX idx_skills_owner_repo ON skills (owner, repo);
CREATE INDEX idx_skills_last_synced_at ON skills (last_synced_at);

-- FTS rebuild
CREATE VIRTUAL TABLE skills_fts USING fts5(
  name, owner, display_name, slug,
  content=skills, content_rowid=rowid
);

INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  SELECT rowid, name, owner, display_name, slug FROM skills;

CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.display_name, new.slug);
END;

CREATE TRIGGER skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.display_name, old.slug);
END;

CREATE TRIGGER skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.display_name, old.slug);
  INSERT INTO skills_fts(rowid, name, owner, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.display_name, new.slug);
END;

-- ---------------------------------------------------------------------------
-- 4. Repos indexes for the hot read paths that now JOIN
-- ---------------------------------------------------------------------------
CREATE INDEX repos_stars_idx ON repos (stars DESC);
CREATE INDEX repos_pushed_at_idx ON repos (pushed_at DESC);
CREATE INDEX repos_broken_idx ON repos (broken_since);
CREATE INDEX repos_kind_idx ON repos (repo_kind);
