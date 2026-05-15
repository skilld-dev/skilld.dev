-- After 0034 split repo facts onto `repos`, dozens of read sites still query
-- `SELECT ... FROM skills` and expect repo-level columns (stars, broken_since,
-- repo_kind, default_branch, …) on the row. Rather than touch every site,
-- expose a `skills_v` view that JOINs `skills` and `repos`. Reads switch to
-- `skills_v`; writes (INSERT/UPDATE/DELETE/ON CONFLICT) keep using `skills` and
-- `repos` directly.
--
-- The view's column list is the union (skills cols first, then repos cols
-- minus the shared owner/repo). Order doesn't matter for named SELECTs; for
-- `SELECT *` callers, the row shape is stable as long as columns don't move
-- back.
CREATE VIEW skills_v AS
SELECT
  skills.name,
  skills.owner,
  skills.repo,
  skills.display_name,
  skills.installs,
  skills.slug,
  skills.description,
  skills.current_sha,
  skills.modified_at,
  skills.first_seen_at,
  skills.references_count,
  skills.last_synced_at,
  skills.sync_status,
  skills.is_abstract,
  skills.target_package,
  skills.abstractness_category,
  skills.is_official,
  skills.source_resolved,
  skills.curator_count,
  skills.curator_reason_count,
  skills.approved_social_count,
  skills.author_social_count,
  skills.seo_index_score,
  skills.seo_indexable,
  skills.seo_index_reasons,
  skills.seo_index_synced_at,
  skills.trust_tier,
  skills.trust_source,
  skills.trust_score,
  skills.trust_reasons,
  skills.trust_synced_at,
  skills.assets,
  skills.rendered_skill_path,
  skills.rendered_status,
  skills.rendered_raw,
  skills.rendered_frontmatter,
  skills.rendered_html,
  skills.rendered_at,
  repos.default_branch,
  repos.stars,
  repos.forks,
  repos.pushed_at,
  repos.repo_created_at,
  repos.repo_meta_synced_at,
  repos.last_tree_sha,
  repos.repo_kind,
  repos.repo_kind_source,
  repos.repo_skill_count,
  repos.broken_since
FROM skills
JOIN repos ON repos.owner = skills.owner AND repos.repo = skills.repo;
