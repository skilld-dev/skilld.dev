-- Make (owner, repo, name) the actual identity of a skill row.
--
-- Two repos owned by the same GitHub user/org can each publish a SKILL.md
-- with the same directory name (e.g. both vercel-labs/openreview and
-- vercel-labs/agent-skills ship web-design-guidelines). Today the (owner,
-- name) primary key causes every sync cycle to ON CONFLICT-clobber the
-- previous row, flipping its `repo` column. Loser's URL 404s.
--
-- D1/SQLite has no ALTER TABLE ... ADD CONSTRAINT, so we rebuild affected
-- tables in place. Dependent tables (skill_revisions, skill_generated,
-- supported_skills, activity) also need `repo` in their key.
--
-- Audit before this migration: 0 (owner, name) collisions on the live table
-- (the old PK prevented them by clobbering). So no dedupe step is required.

-- ---------------------------------------------------------------------------
-- 1. Drop FTS triggers + virtual table (they reference `skills`)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS skills_ai;
DROP TRIGGER IF EXISTS skills_ad;
DROP TRIGGER IF EXISTS skills_au;
DROP TABLE IF EXISTS skills_fts;

-- ---------------------------------------------------------------------------
-- 2. Rebuild `skills` with PK (owner, repo, name)
-- ---------------------------------------------------------------------------
CREATE TABLE skills_new (
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  display_name TEXT NOT NULL,
  installs INTEGER NOT NULL DEFAULT 0,
  slug TEXT NOT NULL,
  broken_since INTEGER,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  pushed_at INTEGER,
  repo_created_at INTEGER,
  description TEXT,
  default_branch TEXT,
  repo_meta_synced_at INTEGER,
  current_sha TEXT,
  modified_at INTEGER,
  first_seen_at INTEGER,
  references_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER,
  sync_status TEXT,
  last_tree_sha TEXT,
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
  repo_skill_count INTEGER NOT NULL DEFAULT 0,
  assets TEXT NOT NULL DEFAULT '[]',
  repo_kind TEXT NOT NULL DEFAULT 'creator'
    CHECK (repo_kind IN ('creator', 'catalog', 'aggregator')),
  repo_kind_source TEXT NOT NULL DEFAULT 'computed'
    CHECK (repo_kind_source IN ('computed', 'override')),
  rendered_skill_path TEXT,
  rendered_status TEXT,
  rendered_raw TEXT,
  rendered_frontmatter TEXT,
  rendered_html TEXT,
  rendered_at INTEGER,
  PRIMARY KEY (owner, repo, name)
);

-- Explicit columns keep fresh local databases and the live database safe even
-- though their ALTER TABLE histories produced different physical column order.
INSERT INTO skills_new (
  name, owner, repo, display_name, installs, slug, broken_since, stars, forks,
  pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, current_sha, modified_at, first_seen_at,
  references_count, last_synced_at, sync_status, last_tree_sha, is_abstract,
  target_package, abstractness_category, is_official, source_resolved,
  curator_count, curator_reason_count, approved_social_count,
  author_social_count, seo_index_score, seo_indexable, seo_index_reasons,
  seo_index_synced_at, trust_tier, trust_source, trust_score, trust_reasons,
  trust_synced_at, repo_skill_count, assets, repo_kind, repo_kind_source,
  rendered_skill_path, rendered_status, rendered_raw, rendered_frontmatter,
  rendered_html, rendered_at
)
SELECT
  name, owner, repo, display_name, installs, slug, broken_since, stars, forks,
  pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, current_sha, modified_at, first_seen_at,
  references_count, last_synced_at, sync_status, last_tree_sha, is_abstract,
  target_package, abstractness_category, is_official, source_resolved,
  curator_count, curator_reason_count, approved_social_count,
  author_social_count, seo_index_score, seo_indexable, seo_index_reasons,
  seo_index_synced_at, trust_tier, trust_source, trust_score, trust_reasons,
  trust_synced_at, repo_skill_count, assets, repo_kind, repo_kind_source,
  rendered_skill_path, rendered_status, rendered_raw, rendered_frontmatter,
  rendered_html, rendered_at
FROM skills;
DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;

-- Recreate indexes (from 0001, 0004, 0005, 0009, 0014, 0023, 0025, 0032)
CREATE INDEX idx_skills_installs ON skills (installs DESC);
CREATE INDEX idx_skills_owner ON skills (owner);
CREATE INDEX idx_skills_broken ON skills (broken_since);
CREATE INDEX idx_skills_stars ON skills (stars DESC);
CREATE INDEX idx_skills_modified ON skills (modified_at DESC);
CREATE INDEX idx_skills_abstract_category
  ON skills (is_abstract, abstractness_category, installs DESC);
CREATE INDEX idx_skills_target_package
  ON skills (target_package, installs DESC)
  WHERE target_package IS NOT NULL;
CREATE INDEX idx_skills_repo_kind
  ON skills (repo_kind, trust_tier, stars DESC);
CREATE INDEX idx_skills_slug ON skills (slug);
CREATE INDEX idx_skills_owner_repo ON skills (owner, repo);
CREATE INDEX idx_skills_last_synced_at ON skills (last_synced_at);

-- Recreate FTS + triggers
CREATE VIRTUAL TABLE skills_fts USING fts5(
  name,
  owner,
  display_name,
  slug,
  content=skills,
  content_rowid=rowid
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
-- 3. Rebuild `skill_revisions` with PK (owner, repo, name, sha)
-- ---------------------------------------------------------------------------
CREATE TABLE skill_revisions_new (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  sha TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  author_login TEXT,
  message TEXT,
  PRIMARY KEY (owner, repo, name, sha)
);

-- Backfill repo via JOIN to skills; drop orphan revisions whose skill row
-- was already clobbered out of existence (should be rare).
INSERT INTO skill_revisions_new (owner, repo, name, sha, modified_at, author_login, message)
SELECT r.owner, s.repo, r.name, r.sha, r.modified_at, r.author_login, r.message
FROM skill_revisions r
JOIN skills s ON s.owner = r.owner AND s.name = r.name;

DROP TABLE skill_revisions;
ALTER TABLE skill_revisions_new RENAME TO skill_revisions;

CREATE INDEX idx_skill_revisions_lookup
  ON skill_revisions (owner, repo, name, modified_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Rebuild `skill_generated` with PK (owner, repo, name, kind)
-- ---------------------------------------------------------------------------
CREATE TABLE skill_generated_new (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sha TEXT NOT NULL,
  payload TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (owner, repo, name, kind)
);

INSERT INTO skill_generated_new (owner, repo, name, kind, sha, payload, generated_at)
SELECT g.owner, COALESCE(g.repo, s.repo), g.name, g.kind, g.sha, g.payload, g.generated_at
FROM skill_generated g
LEFT JOIN skills s ON s.owner = g.owner AND s.name = g.name
WHERE COALESCE(g.repo, s.repo) IS NOT NULL;

DROP TABLE skill_generated;
ALTER TABLE skill_generated_new RENAME TO skill_generated;

-- ---------------------------------------------------------------------------
-- 5. Rebuild `supported_skills` with PK (owner, repo, name)
-- ---------------------------------------------------------------------------
CREATE TABLE supported_skills_new (
  owner        TEXT NOT NULL,
  repo         TEXT NOT NULL,
  name         TEXT NOT NULL,
  support_mode TEXT NOT NULL CHECK (support_mode IN ('include', 'exclude')),
  reason       TEXT NOT NULL,
  reviewed_by  TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo, name)
);

INSERT INTO supported_skills_new (owner, repo, name, support_mode, reason, reviewed_by, reviewed_at, notes, created_at, updated_at)
SELECT ss.owner, COALESCE(ss.repo, s.repo), ss.name, ss.support_mode, ss.reason, ss.reviewed_by, ss.reviewed_at, ss.notes, ss.created_at, ss.updated_at
FROM supported_skills ss
LEFT JOIN skills s ON s.owner = ss.owner AND s.name = ss.name
WHERE COALESCE(ss.repo, s.repo) IS NOT NULL;

DROP TABLE supported_skills;
ALTER TABLE supported_skills_new RENAME TO supported_skills;

CREATE INDEX idx_supported_skills_mode
  ON supported_skills (support_mode, owner, repo, name);

-- ---------------------------------------------------------------------------
-- 6. Add `repo` column to `activity`, backfill, swap the lookup index
-- ---------------------------------------------------------------------------
ALTER TABLE activity ADD COLUMN repo TEXT;

UPDATE activity SET repo = (
  SELECT s.repo FROM skills s
  WHERE s.owner = activity.owner AND s.name = activity.name
  LIMIT 1
)
WHERE repo IS NULL;

DROP INDEX IF EXISTS idx_activity_skill;
CREATE INDEX idx_activity_skill ON activity (owner, repo, name);
