import type { SkillsLeaderboardDbRow } from '../../utils/skills-leaderboard'
import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { canonicalRepoSkillPath, repoHubPath } from '#shared/skill-routes'
import {
  SKILLS_LEADERBOARD_COUNT_SQL,
  SKILLS_LEADERBOARD_PAGE_SIZE,
  SKILLS_LEADERBOARD_PAGE_SQL,
} from '../../utils/skills-leaderboard'

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
})

const PAGE_SIZE = SKILLS_LEADERBOARD_PAGE_SIZE

export interface SkillsLeaderboardItem {
  rank: number
  owner: string
  repo: string
  description: string | null
  stars: number
  skillCount: number
  topSkill: {
    name: string
    /** Final public route. Clients must use this value directly. */
    registryPath: string
    description: string | null
    modifiedAt: number | null
  }
  pushedAt: number | null
  starsSyncedAt: number | null
  reviewedAt: number
  avatarUrl: string
  githubUrl: string
  registryUrl: string
}

export interface SkillsLeaderboardResponse {
  items: SkillsLeaderboardItem[]
  ranking: 'github_stars'
  eligibility: 'reviewed_individual_generic_skill_repositories'
  featuredSkillRanking: 'recently_updated'
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
        description: row.description,
        stars: row.stars,
        skillCount: row.skill_count,
        topSkill: {
          name: row.top_skill_name,
          registryPath: canonicalRepoSkillPath({
            owner: row.owner,
            repo: row.repo,
            name: row.top_skill_name,
            repoSkillCount: row.skill_count,
          }),
          description: row.top_skill_description,
          modifiedAt: row.top_skill_modified_at,
        },
        pushedAt: row.pushed_at,
        starsSyncedAt: row.repo_meta_synced_at,
        reviewedAt: row.reviewed_at,
        avatarUrl: `https://github.com/${encodeURIComponent(row.owner)}.png?size=96`,
        githubUrl: `https://github.com/${row.owner}/${row.repo}`,
        registryUrl: repoHubPath(row.owner, row.repo),
      })),
      ranking: 'github_stars',
      eligibility: 'reviewed_individual_generic_skill_repositories',
      featuredSkillRanking: 'recently_updated',
      starsSyncedAt,
      page: body.page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
    }
  },
})
