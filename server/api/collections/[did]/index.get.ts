import type { CollectionRecord } from '../../../utils/atproto/lexicons/collection'
import { getPublicAgent } from '../../../utils/atproto/agent'
import { COLLECTION_NSID, parseCollectionRecord } from '../../../utils/atproto/lexicons/collection'

const CACHE_PREFIX = 'collections'
const CACHE_TTL = 60 * 5 // 5 minutes

interface CachedCollections {
  collections: Array<{ uri: string, rkey: string, record: CollectionRecord }>
  fetchedAt: string
}

export default defineEventHandler(async (event) => {
  const did = getRouterParam(event, 'did')
  if (!did)
    throw createError({ statusCode: 400, message: 'Missing DID parameter' })

  const cacheKey = `${CACHE_PREFIX}:${did}`
  const cached = await useStorage('data').getItem<CachedCollections>(cacheKey)
  if (cached)
    return cached

  const agent = getPublicAgent()
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: COLLECTION_NSID,
    limit: 100,
  })

  const collections = res.data.records
    .map((r) => {
      const record = parseCollectionRecord(r.value)
      if (!record)
        return null
      return {
        uri: r.uri,
        rkey: r.uri.split('/').pop()!,
        record,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  const result: CachedCollections = {
    collections,
    fetchedAt: new Date().toISOString(),
  }

  await useStorage('data').setItem(cacheKey, result, { ttl: CACHE_TTL })
  return result
})
