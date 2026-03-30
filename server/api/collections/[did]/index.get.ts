import { getPublicAgent } from '../../../utils/atproto/agent'
import { getCachedCollections } from '../../../utils/atproto/collections'

export default defineEventHandler(async (event) => {
  const did = getRouterParam(event, 'did')
  if (!did)
    throw createError({ statusCode: 400, message: 'Missing DID parameter' })

  const agent = getPublicAgent()
  return getCachedCollections(agent, did)
})
