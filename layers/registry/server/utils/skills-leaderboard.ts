export interface SkillsLeaderboardDbRow {
  owner: string
  repo: string
  stars: number
  skill_count: number
  pushed_at: number | null
  repo_meta_synced_at: number | null
  eligibility_reason: string
  reviewed_at: number
}

export const SKILLS_LEADERBOARD_SQL = `
  SELECT
    r.owner,
    r.repo,
    r.stars,
    COUNT(s.name) AS skill_count,
    r.pushed_at,
    r.repo_meta_synced_at,
    eligibility.reason AS eligibility_reason,
    eligibility.reviewed_at
  FROM skill_repo_eligibility AS eligibility
  JOIN repos AS r
    ON r.owner = eligibility.owner
   AND r.repo = eligibility.repo
  JOIN skills AS s
    ON s.owner = r.owner
   AND s.repo = r.repo
  WHERE eligibility.status = 'eligible'
    AND r.broken_since IS NULL
  GROUP BY
    r.owner,
    r.repo,
    r.stars,
    r.pushed_at,
    r.repo_meta_synced_at,
    eligibility.reason,
    eligibility.reviewed_at
  HAVING COUNT(s.name) > 0
  ORDER BY
    r.stars DESC,
    r.owner COLLATE NOCASE ASC,
    r.repo COLLATE NOCASE ASC
`
