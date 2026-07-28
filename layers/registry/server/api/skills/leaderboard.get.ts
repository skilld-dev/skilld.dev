import type { SkillsLeaderboardDbRow } from '../../utils/skills-leaderboard'
import { defineApiHandler } from '#shared/server/handler'
import { SKILLS_LEADERBOARD_SQL } from '../../utils/skills-leaderboard'

export interface SkillsLeaderboardItem {
  rank: number
  owner: string
  repo: string
  stars: number
  skillCount: number
  pushedAt: number | null
  starsSyncedAt: number | null
  eligibilityReason: string
  verifiedAt: number
  avatarUrl: string
  githubUrl: string
  registryUrl: string
}

export interface SkillsLeaderboardResponse {
  items: SkillsLeaderboardItem[]
  ranking: 'github_stars'
  eligibility: 'reviewed_skills_only_repositories'
  starsSyncedAt: number | null
}

export default defineApiHandler<never, SkillsLeaderboardResponse>({
  handler: async ({ platform }): Promise<SkillsLeaderboardResponse> => {
    const result = await platform.db
      .prepare(SKILLS_LEADERBOARD_SQL)
      .all<SkillsLeaderboardDbRow>()
    const rows = result.results ?? []
    const starsSyncedAt = rows.reduce<number | null>(
      (latest, row) => row.repo_meta_synced_at == null
        ? latest
        : Math.max(latest ?? 0, row.repo_meta_synced_at),
      null,
    )

    return {
      items: rows.map((row, index) => ({
        rank: index + 1,
        owner: row.owner,
        repo: row.repo,
        stars: row.stars,
        skillCount: row.skill_count,
        pushedAt: row.pushed_at,
        starsSyncedAt: row.repo_meta_synced_at,
        eligibilityReason: row.eligibility_reason,
        verifiedAt: row.reviewed_at,
        avatarUrl: `https://github.com/${encodeURIComponent(row.owner)}.png?size=96`,
        githubUrl: `https://github.com/${row.owner}/${row.repo}`,
        registryUrl: `/gh/${row.owner}/${row.repo}`,
      })),
      ranking: 'github_stars',
      eligibility: 'reviewed_skills_only_repositories',
      starsSyncedAt,
    }
  },
})
