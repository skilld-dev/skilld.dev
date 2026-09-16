CREATE INDEX idx_activity_recent ON activity (occurred_at DESC, type);

CREATE INDEX idx_activity_skill ON activity (owner, repo, name);

CREATE INDEX idx_ai_ready_pages_indexed ON ai_ready_pages(indexed);

CREATE INDEX idx_ai_ready_pages_indexnow_pending
  ON ai_ready_pages(route)
  WHERE indexed = 1
    AND is_error = 0
    AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at);

CREATE INDEX idx_ai_ready_pages_is_error ON ai_ready_pages(is_error);

CREATE INDEX idx_ai_ready_pages_last_seen ON ai_ready_pages(last_seen_at);

CREATE INDEX idx_ai_ready_pages_locale ON ai_ready_pages(locale);

CREATE INDEX idx_ai_ready_pages_route ON ai_ready_pages(route);

CREATE INDEX idx_ai_ready_pages_source ON ai_ready_pages(source);

CREATE UNIQUE INDEX idx_cli_tokens_refresh
  ON cli_tokens(refresh_hash) WHERE revoked_at IS NULL;

CREATE INDEX idx_cli_tokens_user ON cli_tokens(user_id, revoked_at);

CREATE INDEX idx_collection_skills_v2_repo ON collection_skills_v2(owner, repo);

CREATE INDEX idx_collection_skills_v2_skill
  ON collection_skills_v2(owner, repo, name);

CREATE INDEX idx_collections_v2_author
  ON collections_v2(author_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_collections_v2_featured
  ON collections_v2(featured, featured_at DESC)
  WHERE featured = 1 AND deleted_at IS NULL;

CREATE INDEX idx_device_user_code ON cli_device_sessions(user_code) WHERE status = 'pending';

CREATE INDEX idx_digest_status ON digest_runs(status, window_end DESC);

CREATE UNIQUE INDEX idx_digest_window ON digest_runs(user_id, window_end);

CREATE UNIQUE INDEX weekly_runs_user_window ON weekly_runs (user_id, window_end);

CREATE INDEX weekly_skill_sends_recent
  ON weekly_skill_sends (sent_at DESC, owner, repo, name);

CREATE INDEX weekly_click_events_window ON weekly_click_events (window_end, placement);
CREATE INDEX weekly_click_events_path ON weekly_click_events (path, clicked_at);

CREATE INDEX idx_owners_followers ON owners (followers DESC);

CREATE INDEX idx_skill_revisions_lookup
  ON skill_revisions (owner, repo, name, modified_at DESC);

CREATE INDEX idx_skill_social_lookup
  ON skill_social_posts (skill_slug, status, role, posted_at DESC);

CREATE INDEX idx_skill_social_queue
  ON skill_social_posts (status, fetched_at DESC);

CREATE INDEX idx_skills_abstract_category
  ON skills (is_abstract, abstractness_category, installs DESC);

CREATE INDEX idx_skills_installs ON skills (installs DESC);

CREATE INDEX idx_skills_last_synced_at ON skills (last_synced_at);

CREATE INDEX idx_skills_modified ON skills (modified_at DESC);

CREATE INDEX idx_skills_name_lookup ON skills (name, owner, repo);

CREATE INDEX idx_skills_owner ON skills (owner);

CREATE INDEX idx_skill_likes_skill ON skill_likes(owner, repo, name);

CREATE INDEX idx_skill_likes_user ON skill_likes(user_id, created_at DESC);

CREATE INDEX idx_skills_like_count ON skills(like_count DESC);

CREATE INDEX idx_skills_owner_repo ON skills (owner, repo);

CREATE INDEX idx_skills_slug ON skills (slug);

CREATE INDEX idx_skills_target_package
  ON skills (target_package, installs DESC)
  WHERE target_package IS NOT NULL;

CREATE INDEX idx_starred_user_haskill ON user_starred_repos(user_id, has_skill, starred_at DESC);

CREATE INDEX idx_subs_repo ON skill_subscriptions(owner, repo);

CREATE INDEX idx_subs_user ON skill_subscriptions(user_id, created_at DESC);

CREATE INDEX idx_supported_repos_enabled
  ON supported_repos (enabled, support_tier, owner, repo);

CREATE INDEX idx_supported_skills_mode
  ON supported_skills (support_mode, owner, repo, name);

CREATE INDEX idx_users_login ON users(login);

CREATE INDEX repos_broken_idx ON repos (broken_since);

CREATE INDEX idx_repos_sync_due
  ON repos (repo_meta_synced_at, owner, repo)
  WHERE broken_since IS NULL;

CREATE INDEX repos_kind_idx ON repos (repo_kind);

CREATE INDEX repos_pushed_at_idx ON repos (pushed_at DESC);

CREATE INDEX repos_stars_idx ON repos (stars DESC);

CREATE TABLE _ai_ready_info (
      id TEXT PRIMARY KEY,
      value TEXT,
      version TEXT,
      checksum TEXT,
      ready INTEGER DEFAULT 0
    );

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  sha TEXT NOT NULL
, repo TEXT);

CREATE TABLE ai_ready_cron_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      duration_ms INTEGER,
      pages_indexed INTEGER DEFAULT 0,
      pages_remaining INTEGER DEFAULT 0,
      indexnow_submitted INTEGER DEFAULT 0,
      indexnow_remaining INTEGER DEFAULT 0,
      errors TEXT DEFAULT '[]',
      status TEXT DEFAULT 'running'
    );

CREATE TABLE ai_ready_indexnow_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitted_at INTEGER NOT NULL,
      url_count INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

CREATE TABLE ai_ready_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT UNIQUE NOT NULL,
      route_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      markdown TEXT NOT NULL DEFAULT '',
      headings TEXT NOT NULL DEFAULT '[]',
      keywords TEXT NOT NULL DEFAULT '[]',
      content_hash TEXT,
      updated_at TEXT NOT NULL,
      indexed_at INTEGER NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      indexed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'prerender',
      last_seen_at INTEGER,
      indexnow_synced_at INTEGER,
      locale TEXT NOT NULL DEFAULT ''
    );

CREATE VIRTUAL TABLE ai_ready_pages_fts USING fts5(
      route, title, description, markdown, headings, keywords,
      content=ai_ready_pages, content_rowid=id, tokenize='unicode61 remove_diacritics 2'
    );

CREATE TABLE 'ai_ready_pages_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;

CREATE TABLE 'ai_ready_pages_fts_data'(id INTEGER PRIMARY KEY, block BLOB);

CREATE TABLE 'ai_ready_pages_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);

CREATE TABLE 'ai_ready_pages_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;

CREATE TABLE ai_ready_sitemaps (
      name TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      last_crawled_at INTEGER,
      url_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_error TEXT
    );

CREATE TABLE cli_auth_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_challenge TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'cli',
  cli_version TEXT,
  redirect_port INTEGER NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE cli_device_sessions (
  device_code TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  cli_version TEXT,
  machine_hint TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','authorized','expired','denied')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  authorized_at INTEGER
);

CREATE TABLE cli_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  prev_refresh_hash TEXT,
  prev_refresh_expires_at INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('oauth','pat','oidc')),
  scopes TEXT NOT NULL DEFAULT 'cli',
  device_label TEXT,
  cli_version TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);

CREATE TABLE collection_skills_v2 (
  collection_id INTEGER NOT NULL REFERENCES collections_v2(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  reason TEXT, name TEXT,
  PRIMARY KEY (collection_id, position)
);

CREATE TABLE "collections_v2" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  preamble TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  featured_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (author_user_id, slug)
);

CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE digest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  change_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','skipped','failed')),
  resend_id TEXT,
  ai_summary_used INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  error TEXT
);

CREATE TABLE weekly_click_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  window_end INTEGER NOT NULL,
  placement TEXT NOT NULL,
  path TEXT NOT NULL,
  clicked_at INTEGER NOT NULL
);

CREATE TABLE email_preference_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  list TEXT NOT NULL CHECK (list IN ('weekly', 'digest')),
  action TEXT NOT NULL CHECK (action IN ('unsubscribed', 'restored')),
  occurred_at INTEGER NOT NULL
);

CREATE TABLE weekly_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  liked_count INTEGER NOT NULL DEFAULT 0,
  trending_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('claimed','sent','skipped','failed','uncertain')),
  provider_message_id TEXT,
  provider_status TEXT,
  claimed_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT
);

CREATE TABLE weekly_skill_sends (
  window_end INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (window_end, owner, repo, name)
);

CREATE TABLE owners (
  owner TEXT PRIMARY KEY,
  kind TEXT,
  name TEXT,
  bio TEXT,
  blog TEXT,
  location TEXT,
  followers INTEGER NOT NULL DEFAULT 0,
  public_repos INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER,
  sync_status TEXT
);

CREATE TABLE repo_kind_overrides (
  owner       TEXT NOT NULL,
  repo        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('creator', 'catalog', 'aggregator')),
  reason      TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo)
);

CREATE TABLE repo_star_observations (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  observed_day INTEGER NOT NULL CHECK (observed_day >= 0 AND observed_day % 86400 = 0),
  stars INTEGER NOT NULL CHECK (stars >= 0),
  PRIMARY KEY (owner, repo, observed_day),
  FOREIGN KEY (owner, repo) REFERENCES repos(owner, repo) ON DELETE CASCADE
);

CREATE TABLE repo_trust_overrides (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('official', 'trusted-author', 'trusted-curator', 'candidate', 'untrusted', 'quarantined')),
  source TEXT NOT NULL DEFAULT 'manual',
  reason TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo)
);

CREATE TABLE auto_index_rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0)
);

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
  tree_truncated_at INTEGER,
  PRIMARY KEY (owner, repo)
);

CREATE TABLE "skill_generated" (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sha TEXT NOT NULL,
  payload TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (owner, repo, name, kind)
);

CREATE TABLE "skill_revisions" (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  sha TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  author_login TEXT,
  message TEXT,
  PRIMARY KEY (owner, repo, name, sha)
);

CREATE TABLE skill_social_posts (
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

CREATE TABLE skill_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, owner, repo, name)
);

CREATE TABLE skill_subscriptions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL,
  muted_until INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, owner, repo)
);

CREATE TABLE "skills" (
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
  like_count INTEGER NOT NULL DEFAULT 0,
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

CREATE VIRTUAL TABLE skills_fts USING fts5(
  name, owner, repo, display_name, slug, description,
  content=skills, content_rowid=rowid
);

CREATE TABLE 'skills_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;

CREATE TABLE 'skills_fts_data'(id INTEGER PRIMARY KEY, block BLOB);

CREATE TABLE 'skills_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);

CREATE TABLE 'skills_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;

CREATE TABLE supported_repos (
  owner        TEXT NOT NULL,
  repo         TEXT NOT NULL,
  support_tier TEXT NOT NULL CHECK (support_tier IN (
    'core-official',
    'trusted-author',
    'curated',
    'candidate'
  )),
  enabled      INTEGER NOT NULL DEFAULT 1,
  reason       TEXT NOT NULL,
  reviewed_by  TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner, repo)
);

CREATE TABLE "supported_skills" (
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

CREATE TABLE user_starred_repos (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  starred_at INTEGER NOT NULL,
  has_skill INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, owner, repo)
);

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
  weekly_opt_out INTEGER NOT NULL DEFAULT 0,
  digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('weekly','daily','off')),
  digest_dow INTEGER DEFAULT 1,
  digest_hour INTEGER NOT NULL DEFAULT 9,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  onboarded_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  likes_public INTEGER NOT NULL DEFAULT 0 CHECK (likes_public IN (0, 1))
);

CREATE TRIGGER ai_ready_pages_ad AFTER DELETE ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
    END;

CREATE TRIGGER ai_ready_pages_ai AFTER INSERT ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END;

CREATE TRIGGER ai_ready_pages_au AFTER UPDATE ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
      INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END;

CREATE TRIGGER skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug, description)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug, old.description);
END;

CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug, description)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug, new.description);
END;

CREATE TRIGGER skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, owner, repo, display_name, slug, description)
  VALUES ('delete', old.rowid, old.name, old.owner, old.repo, old.display_name, old.slug, old.description);
  INSERT INTO skills_fts(rowid, name, owner, repo, display_name, slug, description)
  VALUES (new.rowid, new.name, new.owner, new.repo, new.display_name, new.slug, new.description);
END;

CREATE TABLE skill_dirty (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  reason TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, repo, name, reason)
);

CREATE INDEX idx_skill_dirty_queued ON skill_dirty(queued_at);

CREATE TABLE sync_jobs (
  name TEXT PRIMARY KEY,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  stale_after_seconds INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  last_duration_ms INTEGER,
  run_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ai_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anthropic_batch_id TEXT NOT NULL UNIQUE,
  kinds TEXT NOT NULL,
  skill_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  completed_at INTEGER,
  index_map TEXT
);

CREATE INDEX idx_ai_batches_status ON ai_batches(status);
