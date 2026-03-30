import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { bustCollectionsCache, syncCuratorAfterChange } from '../../utils/atproto/collections'
import { COLLECTION_NSID } from '../../utils/atproto/lexicons/collection'

export default defineEventHandler(async (event) => {
  const rkey = getRouterParam(event, 'rkey')
  if (!rkey)
    throw createError({ statusCode: 400, message: 'Missing rkey parameter' })

  const { agent, did } = await getAuthenticatedAgent(event)

  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: COLLECTION_NSID,
    rkey,
  })

  await bustCollectionsCache(did)
  await syncCuratorAfterChange(getDB(event), agent, did)

  return { deleted: true }
})
