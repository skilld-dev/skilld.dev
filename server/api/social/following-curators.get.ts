import type { IndexedCurator } from '../../utils/atproto/curator-index'
import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { getCuratorsByDids } from '../../utils/atproto/curator-index'

export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)

  // Fetch all of user's follows from Bluesky (full pagination)
  const followDids: string[] = []
  let cursor: string | undefined

  do {
    const res = await agent.getFollows({ actor: did, limit: 100, cursor })
    for (const follow of res.data.follows) {
      followDids.push(follow.did)
    }
    cursor = res.data.cursor
  } while (cursor)

  if (!followDids.length)
    return { curators: [], total: 0 }

  // Cross-reference with curator index
  const matchedCurators = await getCuratorsByDids(getDB(event), followDids)

  // Sort by most recently published
  matchedCurators.sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))

  return {
    curators: matchedCurators as IndexedCurator[],
    total: matchedCurators.length,
  }
})
