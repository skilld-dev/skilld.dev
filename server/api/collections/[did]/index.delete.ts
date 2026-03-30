import { getAuthenticatedAgent } from '../../../utils/atproto/agent'
import { bustCollectionsCache, syncCuratorAfterChange } from '../../../utils/atproto/collections'
import { COLLECTION_NSID } from '../../../utils/atproto/lexicons/collection'

/**
 * Delete a collection by rkey.
 * The :did param in the URL is used as the rkey here (the client sends DELETE /api/collections/:rkey).
 * This avoids a Nitro routing conflict between [did]/index.get.ts and a top-level [rkey].delete.ts.
 */
export default defineEventHandler(async (event) => {
  const rkey = getRouterParam(event, 'did')
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
