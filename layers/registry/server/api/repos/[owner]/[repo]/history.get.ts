import type { HistoryPoint, StarHistory } from '../../../../utils/repo-history'
import { writeCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { resolveGithubBindings } from '../../../../utils/github-client'
import { buildCumulativeSkillHistory, fetchGithubStarHistory } from '../../../../utils/repo-history'
import { resolveRepoSourceIdentity } from '../../../../utils/repo-source-identity'

const STAR_HISTORY_TTL = 60 * 60 * 24
const STAR_HISTORY_FAILURE_TTL = 60 * 15
const STAR_HISTORY_PAGE_BUDGET = 16

interface SkillHistoryRow {
  first_seen_at: number | null
}

interface RepoHistoryRow {
  repo_created_at: number | null
}

export interface RepoHistoryResponse {
  skillHistory: {
    _tag: 'ready'
    approximate: false
    points: HistoryPoint[]
  }
  starHistory: StarHistory
}

function parseHistoryPoints(input: unknown): HistoryPoint[] | null {
  if (!Array.isArray(input) || input.length > 64)
    return null
  const points: HistoryPoint[] = []
  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object')
      return null
    const at = 'at' in candidate ? candidate.at : null
    const value = 'value' in candidate ? candidate.value : null
    if (typeof at !== 'number' || !Number.isFinite(at) || typeof value !== 'number' || !Number.isFinite(value))
      return null
    points.push({ at, value })
  }
  return points
}

function parseCachedStarHistory(input: unknown): StarHistory | null {
  if (!input || typeof input !== 'object' || !('_tag' in input) || !('sampledAt' in input))
    return null
  if (typeof input.sampledAt !== 'number' || !Number.isFinite(input.sampledAt))
    return null
  if (input._tag === 'ready' && 'points' in input) {
    const points = parseHistoryPoints(input.points)
    return points
      ? { _tag: 'ready', approximate: true, points, sampledAt: input.sampledAt }
      : null
  }
  if (input._tag === 'unavailable' && 'reason' in input && 'status' in input) {
    const reasons = ['github_status', 'invalid_response', 'network'] as const
    const reason = reasons.find(candidate => candidate === input.reason)
    const status = input.status
    if (!reason || (status !== null && (typeof status !== 'number' || !Number.isFinite(status))))
      return null
    return { _tag: 'unavailable', reason, status, sampledAt: input.sampledAt }
  }
  return null
}

export default defineApiHandler<never, RepoHistoryResponse>({
  handler: async ({ event, platform }) => {
    const ownerParam = getRouterParam(event, 'owner')
    const repoParam = getRouterParam(event, 'repo')
    if (!ownerParam || !repoParam)
      throw createError({ statusCode: 400, message: 'Missing owner or repo parameter' })

    const registry = {
      owner: ownerParam.toLowerCase(),
      repo: repoParam.toLowerCase(),
    }
    const now = Math.floor(Date.now() / 1000)
    const [source, skillRows, repoRow] = await Promise.all([
      resolveRepoSourceIdentity(platform.db, registry),
      platform.db
        .prepare(`
          SELECT first_seen_at
          FROM skills
          WHERE owner = ? AND repo = ?
          ORDER BY first_seen_at
        `)
        .bind(registry.owner, registry.repo)
        .all<SkillHistoryRow>(),
      platform.db
        .prepare(`
          SELECT repo_created_at
          FROM repos
          WHERE owner = ? AND repo = ?
        `)
        .bind(registry.owner, registry.repo)
        .first<RepoHistoryRow>(),
    ])

    const cacheKey = `repo-star-history:v1:${source.owner.toLowerCase()}/${source.repo.toLowerCase()}`
    const storage = useStorage('cache')
    const cached = await storage.getItem<unknown>(cacheKey).catch((error) => {
      console.warn(`[repo-history] cache read failed for ${cacheKey}`, error)
      return null
    })
    let starHistory = parseCachedStarHistory(cached)
    if (!starHistory) {
      starHistory = await fetchGithubStarHistory(
        source.owner,
        source.repo,
        resolveGithubBindings(platform.env),
        {
          fetch: globalThis.fetch,
          now: () => now,
          pageBudget: STAR_HISTORY_PAGE_BUDGET,
        },
      )
      if (starHistory._tag === 'unavailable') {
        console.warn(JSON.stringify({
          event: 'repo_star_history_unavailable',
          owner: source.owner,
          repo: source.repo,
          reason: starHistory.reason,
          upstreamStatus: starHistory.status,
        }))
      }
      await writeCache(storage, cacheKey, starHistory, {
        ttl: starHistory._tag === 'ready' ? STAR_HISTORY_TTL : STAR_HISTORY_FAILURE_TTL,
      })
    }

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
      starHistory,
    }
  },
})
