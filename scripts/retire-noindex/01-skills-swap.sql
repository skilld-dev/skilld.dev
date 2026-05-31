-- Retire non-indexable skills via table-swap (DROP reclaims doomed rows at zero
-- write cost). Keeps only seo_indexable=1. Atomic: whole file = one D1 request.
CREATE TABLE "skills_new" (
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
  ai_generated_sha TEXT,
  PRIMARY KEY (owner, repo, name)
);
INSERT INTO skills_new SELECT * FROM skills WHERE seo_indexable = 1;
DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;
CREATE INDEX idx_skills_installs ON skills (installs DESC);
CREATE INDEX idx_skills_owner ON skills (owner);
CREATE INDEX idx_skills_modified ON skills (modified_at DESC);
CREATE INDEX idx_skills_abstract_category ON skills (is_abstract, abstractness_category, installs DESC);
CREATE INDEX idx_skills_target_package ON skills (target_package, installs DESC) WHERE target_package IS NOT NULL;
CREATE INDEX idx_skills_slug ON skills (slug);
CREATE INDEX idx_skills_owner_repo ON skills (owner, repo);
CREATE INDEX idx_skills_last_synced_at ON skills (last_synced_at);
CREATE INDEX idx_skills_ai_gen_sha ON skills (ai_generated_sha);
CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug);
END;
CREATE TRIGGER skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug);
END;
CREATE TRIGGER skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug);
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug);
END;
INSERT INTO skills_fts(skills_fts) VALUES('rebuild');
