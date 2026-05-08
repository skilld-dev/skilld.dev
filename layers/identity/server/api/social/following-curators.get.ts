import type { IndexedCurator } from '../../utils/atproto/curator-index'
import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { getCuratorsByDids } from '../../utils/atproto/curator-index'
import { getFollowsCache, refreshFollowsCache } from '../../utils/atproto/follows'

export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)
  const db = getDB(event)

  let { followedDids, refreshedAt, isMissing, isStale } = await getFollowsCache(db, did)

  // First-login bootstrap: pull synchronously so the user sees their network immediately.
  if (isMissing) {
    followedDids = await refreshFollowsCache(db, agent, did)
    refreshedAt = Math.floor(Date.now() / 1000)
    isStale = false
  }

  if (!followedDids.length)
    return { curators: [], total: 0, refreshedAt, isStale }

  const matchedCurators = await getCuratorsByDids(db, followedDids)
  matchedCurators.sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))

  return {
    curators: matchedCurators as IndexedCurator[],
    total: matchedCurators.length,
    refreshedAt,
    isStale,
  }
})
