/**
 * Recent updates feed: one row per skill, its latest update only, then at most
 * `?2` rows per repository, newest repositories first.
 *
 * Bindings: `?1` window start (unix seconds), `?2` rows per repository, `?3`
 * total rows.
 *
 * The activity table logs every sync, so a repository whose bot commits daily
 * writes hundreds of rows for one skill. A plain "latest 60 rows" read
 * returned that single skill sixty times and nothing else, and the homepage
 * showed one card with a skill count of sixty.
 *
 * The query starts from the skills that can appear: official, abstract, and in
 * a repository with 100 stars or more. About 90 skills qualify. For each one a
 * correlated seek takes its newest `skill_updated` row. The previous shape
 * ranked every `skill_updated` row in the window with a window function before
 * it filtered, and read about 48K rows per call. This shape reads about 2K with
 * `idx_activity_skill_latest` and about 4.5K without it.
 *
 * Two rows for one skill can share `occurred_at`. The higher activity id wins,
 * because that row was written last.
 */
export const RECENT_UPDATES_SQL = `WITH latest_per_skill AS (
  SELECT s.owner, s.repo, s.name, a.occurred_at, a.sha
  FROM skills s
  INNER JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  INNER JOIN activity a ON a.id = (
    SELECT latest.id
    FROM activity latest
    WHERE latest.type = 'skill_updated'
      AND latest.owner = s.owner
      AND latest.repo = s.repo
      AND latest.name = s.name
      AND latest.occurred_at >= ?1
    ORDER BY latest.occurred_at DESC, latest.id DESC
    LIMIT 1
  )
  WHERE s.is_abstract = 1 AND s.is_official = 1
    AND r.stars >= 100
),
ranked AS (
  SELECT owner, repo, name, occurred_at, sha,
         ROW_NUMBER() OVER (PARTITION BY owner, repo ORDER BY occurred_at DESC) AS repo_rank,
         MAX(occurred_at) OVER (PARTITION BY owner, repo) AS repo_latest,
         COUNT(*) OVER (PARTITION BY owner, repo) AS repo_updated_count
  FROM latest_per_skill
)
SELECT a.owner, a.name, a.occurred_at, a.sha, a.repo_updated_count,
       s.display_name, s.repo, s.description, s.slug, s.sync_status,
       revisions.message AS change_summary,
       (SELECT COUNT(*) FROM skills repo_skills
        WHERE repo_skills.owner = s.owner
          AND repo_skills.repo = s.repo
          AND repo_skills.source_resolved = 1) AS repo_skill_count
FROM ranked a
INNER JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
LEFT JOIN skill_revisions revisions
  ON revisions.owner = a.owner
 AND revisions.repo = a.repo
 AND revisions.name = a.name
 AND revisions.sha = (
   SELECT candidate.sha
   FROM skill_revisions candidate
   WHERE candidate.owner = a.owner
     AND candidate.repo = a.repo
     AND candidate.name = a.name
     AND candidate.modified_at <= a.occurred_at
   ORDER BY candidate.modified_at DESC, candidate.sha DESC
   LIMIT 1
 )
WHERE a.repo_rank <= ?2
ORDER BY a.repo_latest DESC, a.occurred_at DESC
LIMIT ?3`
