import type { HistoryPoint, StarHistory } from '../../../../utils/repo-history'
import { defineApiHandler } from '#shared/server/handler'
import { buildCumulativeSkillHistory, buildObservedStarHistory } from '../../../../utils/repo-history'

interface SkillHistoryRow {
  first_seen_at: number | null
}

interface RepoHistoryRow {
  repo_created_at: number | null
}

interface StarObservationRow {
  observed_day: number
  stars: number
}

export interface RepoHistoryResponse {
  skillHistory: {
    _tag: 'ready'
    approximate: false
    points: HistoryPoint[]
  }
  starHistory: StarHistory
}

export default defineApiHandler<never, RepoHistoryResponse>({
  handler: async ({ event, platform }) => {
    const ownerParam = getRouterParam(event, 'owner')
    const repoParam = getRouterParam(event, 'repo')
    if (!ownerParam || !repoParam)
      throw createError({ statusCode: 400, message: 'Missing owner or repo parameter' })

    const owner = ownerParam.toLowerCase()
    const repo = repoParam.toLowerCase()
    const now = Math.floor(Date.now() / 1000)
    const [skillRows, repoRow, starRows] = await Promise.all([
      platform.db
        .prepare(`
          SELECT first_seen_at
          FROM skills
          WHERE owner = ? AND repo = ?
          ORDER BY first_seen_at
        `)
        .bind(owner, repo)
        .all<SkillHistoryRow>(),
      platform.db
        .prepare(`
          SELECT repo_created_at
          FROM repos
          WHERE owner = ? AND repo = ?
        `)
        .bind(owner, repo)
        .first<RepoHistoryRow>(),
      platform.db
        .prepare(`
          SELECT observed_day, stars
          FROM (
            SELECT observed_day, stars
            FROM repo_star_observations
            WHERE owner = ? AND repo = ?
            ORDER BY observed_day DESC
            LIMIT 90
          )
          ORDER BY observed_day
        `)
        .bind(owner, repo)
        .all<StarObservationRow>(),
    ])

    setResponseHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600')
    return {
      skillHistory: {
        _tag: 'ready',
        approximate: false,
        points: buildCumulativeSkillHistory(
          (skillRows.results ?? []).map(row => row.first_seen_at),
          now,
          16,
          repoRow?.repo_created_at,
        ),
      },
      starHistory: buildObservedStarHistory(
        (starRows.results ?? []).map(row => ({
          observedDay: row.observed_day,
          stars: row.stars,
        })),
      ),
    }
  },
})
