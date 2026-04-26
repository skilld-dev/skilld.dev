/// <reference types="@cloudflare/workers-types" />
import { getPublicAgent } from '../utils/atproto/agent'
import { FOLLOWS_STALENESS_MS, getStaleFollowers, refreshFollowsCache } from '../utils/atproto/follows'

const BATCH = 25

/**
 * Scheduled task: refresh follow caches for users whose data is stale.
 * `app.bsky.graph.getFollows` is a public AppView call, so this runs
 * without OAuth restoration.
 */
export default defineTask({
  meta: {
    name: 'refresh-follows',
    description: 'Refresh AT Protocol follow caches for stale users',
  },
  async run({ context }) {
    const db = (context as Record<string, any>).cloudflare?.env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[refresh-follows] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    const followers = await getStaleFollowers(db, {
      staleAfterMs: FOLLOWS_STALENESS_MS,
      limit: BATCH,
    })
    if (!followers.length)
      return { result: { refreshed: 0, errored: 0 } }

    const agent = getPublicAgent()
    const results = await Promise.allSettled(
      followers.map(did => refreshFollowsCache(db, agent, did)),
    )

    let refreshed = 0
    let errored = 0
    for (const r of results) {
      if (r.status === 'fulfilled') {
        refreshed++
      }
      else {
        errored++
        console.warn('[refresh-follows] Refresh failed:', r.reason)
      }
    }
    return { result: { refreshed, errored } }
  },
})
