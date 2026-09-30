export interface SkillsLeaderboardDbRow {
  owner: string
  repo: string
  description: string | null
  stars: number
  skill_count: number
  top_skill_name: string
  top_skill_slug: string
  top_skill_description: string | null
  top_skill_modified_at: number | null
  pushed_at: number | null
  repo_meta_synced_at: number | null
  reviewed_at: number
}

export const SKILLS_LEADERBOARD_SQL = `
  WITH eligible_repositories AS (
    SELECT
      r.owner,
      r.repo,
      r.description,
      r.stars,
      r.pushed_at,
      r.repo_meta_synced_at,
      eligibility.reviewed_at
    FROM skill_repo_eligibility AS eligibility
    JOIN repos AS r
      ON r.owner = eligibility.owner
     AND r.repo = eligibility.repo
    JOIN owners AS owner
      ON owner.owner = r.owner
     AND owner.kind = 'user'
    WHERE eligibility.status = 'eligible'
      AND r.broken_since IS NULL
  ),
  ranked_skills AS (
    SELECT
      s.owner,
      s.repo,
      s.name,
      s.slug,
      s.description,
      s.modified_at,
      COUNT(*) OVER (
        PARTITION BY s.owner, s.repo
      ) AS skill_count,
      ROW_NUMBER() OVER (
        PARTITION BY s.owner, s.repo
        ORDER BY
          s.modified_at DESC,
          s.name COLLATE NOCASE ASC
      ) AS recency_rank
    FROM skills AS s
    JOIN eligible_repositories AS repository
      ON repository.owner = s.owner
     AND repository.repo = s.repo
    WHERE s.source_resolved = 1
  )
  SELECT
    repository.owner,
    repository.repo,
    repository.description,
    repository.stars,
    s.skill_count,
    s.name AS top_skill_name,
    s.slug AS top_skill_slug,
    s.description AS top_skill_description,
    s.modified_at AS top_skill_modified_at,
    repository.pushed_at,
    repository.repo_meta_synced_at,
    repository.reviewed_at
  FROM eligible_repositories AS repository
  JOIN ranked_skills AS s
    ON s.owner = repository.owner
   AND s.repo = repository.repo
   AND s.recency_rank = 1
  ORDER BY
    repository.stars DESC,
    repository.owner COLLATE NOCASE ASC,
    repository.repo COLLATE NOCASE ASC
`

/** Rows one page of the `all` board holds. The board shows page 1 only. */
export const SKILLS_LEADERBOARD_PAGE_SIZE = 50

export const SKILLS_LEADERBOARD_PAGE_SQL = `
  ${SKILLS_LEADERBOARD_SQL}
  LIMIT ? OFFSET ?
`

export const SKILLS_LEADERBOARD_COUNT_SQL = `
  SELECT COUNT(*) AS total
  FROM (${SKILLS_LEADERBOARD_SQL})
`
