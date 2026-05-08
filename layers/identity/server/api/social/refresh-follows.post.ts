import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { canRefreshFollows, refreshFollowsCache } from '../../utils/atproto/follows'

export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)
  const db = getDB(event)

  if (!await canRefreshFollows(db, did)) {
    throw createError({
      statusCode: 429,
      message: 'Follow list was refreshed recently. Try again in a few minutes.',
    })
  }

  const dids = await refreshFollowsCache(db, agent, did)
  return {
    refreshedAt: new Date().toISOString(),
    followCount: dids.length,
  }
})
