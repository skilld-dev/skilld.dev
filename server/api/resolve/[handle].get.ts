import type { CuratorLabel } from '../../utils/atproto/curator-index'
import { getPublicAgent } from '../../utils/atproto/agent'
import { getCuratorsByDids } from '../../utils/atproto/curator-index'
import { isProfileFlagged } from '../../utils/atproto/moderation'

const CACHE_PREFIX = 'resolve:profile'
const CACHE_TTL = 60 * 10 // 10 minutes

interface CachedProfile {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  description?: string
  labels: CuratorLabel[]
}

export default defineEventHandler(async (event) => {
  const handle = getRouterParam(event, 'handle')
  if (!handle)
    throw createError({ statusCode: 400, message: 'Missing handle parameter' })

  const cacheKey = `${CACHE_PREFIX}:${handle}`
  const cached = await useStorage('data').getItem<CachedProfile>(cacheKey)
  if (cached)
    return cached

  const agent = getPublicAgent()
  const res = await agent.getProfile({ actor: handle }).catch(() => null)

  if (!res?.data)
    throw createError({ statusCode: 404, message: `Profile not found for @${handle}` })

  if (isProfileFlagged(res.data))
    throw createError({ statusCode: 403, message: 'This account is not available' })

  // Look up curator labels from the index
  const [curator] = await getCuratorsByDids([res.data.did])

  const profile: CachedProfile = {
    did: res.data.did,
    handle: res.data.handle,
    displayName: res.data.displayName,
    avatar: res.data.avatar,
    description: res.data.description,
    labels: curator?.labels ?? [],
  }

  await useStorage('data').setItem(cacheKey, profile, { ttl: CACHE_TTL })
  return profile
})
