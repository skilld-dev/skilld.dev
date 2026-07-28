import type { SkillsLeaderboardDbRow } from '../../utils/skills-leaderboard'
import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import {
  SKILLS_LEADERBOARD_COUNT_SQL,
  SKILLS_LEADERBOARD_PAGE_SQL,
} from '../../utils/skills-leaderboard'

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
})

const PAGE_SIZE = 50

export interface SkillsLeaderboardItem {
  rank: number
  owner: string
  repo: string
  stars: number
  skillCount: number
  topSkill: {
    name: string
    displayName: string
    installs: number
    registryUrl: string
  }
  pushedAt: number | null
  starsSyncedAt: number | null
  eligibilityReason: string
  reviewedAt: number
  avatarUrl: string
  githubUrl: string
  registryUrl: string
}

export interface SkillsLeaderboardResponse {
  items: SkillsLeaderboardItem[]
  ranking: 'github_stars'
  eligibility: 'reviewed_individual_generic_skill_repositories'
  featuredSkillRanking: 'installs'
  starsSyncedAt: number | null
  page: number
  pageSize: number
  pageCount: number
  total: number
}

export default defineApiHandler<typeof query, SkillsLeaderboardResponse>({
  schema: query,
  handler: async ({ body, platform }): Promise<SkillsLeaderboardResponse> => {
    const offset = (body.page - 1) * PAGE_SIZE
    const [result, countRow] = await Promise.all([
      platform.db
        .prepare(SKILLS_LEADERBOARD_PAGE_SQL)
        .bind(PAGE_SIZE, offset)
        .all<SkillsLeaderboardDbRow>(),
      platform.db
        .prepare(SKILLS_LEADERBOARD_COUNT_SQL)
        .first<{ total: number }>(),
    ])
    const rows = result.results ?? []
    const total = countRow?.total ?? 0
    const starsSyncedAt = rows.reduce<number | null>(
      (latest, row) => row.repo_meta_synced_at == null
        ? latest
        : Math.max(latest ?? 0, row.repo_meta_synced_at),
      null,
    )

    return {
      items: rows.map((row, index) => ({
        rank: offset + index + 1,
        owner: row.owner,
        repo: row.repo,
        stars: row.stars,
        skillCount: row.skill_count,
        topSkill: {
          name: row.top_skill_name,
          displayName: row.top_skill_display_name,
          installs: row.top_skill_installs,
          registryUrl: `/gh/${row.owner}/${row.repo}/${encodeURIComponent(row.top_skill_name)}`,
        },
        pushedAt: row.pushed_at,
        starsSyncedAt: row.repo_meta_synced_at,
        eligibilityReason: row.eligibility_reason,
        reviewedAt: row.reviewed_at,
        avatarUrl: `https://github.com/${encodeURIComponent(row.owner)}.png?size=96`,
        githubUrl: `https://github.com/${row.owner}/${row.repo}`,
        registryUrl: `/gh/${row.owner}/${row.repo}`,
      })),
      ranking: 'github_stars',
      eligibility: 'reviewed_individual_generic_skill_repositories',
      featuredSkillRanking: 'installs',
      starsSyncedAt,
      page: body.page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
    }
  },
})
