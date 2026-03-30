import { getAuthenticatedAgent } from '../../utils/atproto/agent'
import { removeCuratorIfEmpty, upsertCurator } from '../../utils/atproto/curator-index'
import { COLLECTION_NSID } from '../../utils/atproto/lexicons/collection'

const CACHE_PREFIX = 'collections'

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

  // Bust cache
  await useStorage('data').removeItem(`${CACHE_PREFIX}:${did}`)

  // Update curator index
  const remaining = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: COLLECTION_NSID,
    limit: 1,
  }).catch(() => null)

  if (remaining?.data.records.length) {
    const profile = await agent.getProfile({ actor: did }).catch(() => null)
    await upsertCurator({
      did,
      handle: profile?.data.handle ?? did,
      displayName: profile?.data.displayName,
      avatar: profile?.data.avatar,
      collectionCount: remaining.data.records.length,
    })
  }
  else {
    await removeCuratorIfEmpty(did)
  }

  return { deleted: true }
})
