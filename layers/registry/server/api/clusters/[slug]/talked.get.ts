/**
 * Skills in one track that devs posted about, scored as `/skills/trending`
 * scores them, with the posts that ranked each one.
 *
 * ADR-0010 admits this order on a track page. Social mentions only: a star
 * surge says a repository moved, and the section this feeds is headed "devs
 * talked about". The page decides whether the list clears the minimum; this
 * route only ranks.
 */

import type { TrackTalkedResult } from '../../../presenters/track-talked'
import { readThroughCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { loadTrendingSkills } from '#shared/server/trending-skills'
import { MAX_TALKED_ROWS, trackRangeMeta } from '#shared/track-board'
import { CLUSTER_BY_SLUG } from '../../../data/clusters'
import { presentTrackTalked } from '../../../presenters/track-talked'
import { TrackTalkedQuery } from '../../../schemas/track-talked-query'
import { findClusterCandidates } from '../../../utils/cluster-membership'

/**
 * The trending feed's windows: posts arrive every 15 minutes at most, and a
 * stale list beats an error page through a D1 blip.
 */
const FRESH_SECONDS = 300
const STALE_SECONDS = 3600

export default defineApiHandler({
  schema: TrackTalkedQuery,
  handler: async ({ event, body, platform }): Promise<TrackTalkedResult> => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const cluster = CLUSTER_BY_SLUG.get(slug)
    if (!cluster)
      throw createError({ statusCode: 404, statusMessage: 'Unknown track' })

    const compute = async (): Promise<TrackTalkedResult> => {
      const now = Math.floor(Date.now() / 1000)
      // No `deprioritizeRepositories`, unlike the trending board. That demotion
      // moves the most-starred repositories below every other row, and the line
      // under this section says rows rank by how many devs talked about each
      // one. Measured on 2026-10-06, it put a Skill one dev posted about above
      // `ponytail`, which seven devs posted about.
      const skills = await loadTrendingSkills({
        db: platform.db,
        now,
        windowHours: trackRangeMeta(body.range).windowHours,
        limit: MAX_TALKED_ROWS,
        scope: {
          _tag: 'members',
          keep: candidates => findClusterCandidates(platform.db, cluster.categories, cluster.pinnedExamples, candidates),
        },
      })
      return { computedAt: now, skills }
    }

    // A deployment identifies the answer's shape, so no release reads another
    // release's entry. Without that identity the shared store is skipped.
    const deployment = platform.env?.CF_VERSION_METADATA?.id
    if (typeof deployment !== 'string' || !deployment.trim())
      return compute()

    const result = await readThroughCache(
      useStorage('edge-cache'),
      `track-talked:v1:${deployment}:${slug}:${body.range}`,
      compute,
      { ttl: FRESH_SECONDS, staleTtl: STALE_SECONDS },
    )
    setHeader(event, 'Cache-Control', `max-age=${FRESH_SECONDS}`)
    return result
  },
  presenter: (result, { body }) => presentTrackTalked(result, body.range),
})
