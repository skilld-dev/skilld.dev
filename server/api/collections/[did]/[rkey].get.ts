import { getPdsAgent } from '../../../utils/atproto/agent'
import { COLLECTION_NSID, parseCollectionRecord } from '../../../utils/atproto/lexicons/collection'

export default defineEventHandler(async (event) => {
  const did = getRouterParam(event, 'did')
  const rkey = getRouterParam(event, 'rkey')
  if (!did || !rkey)
    throw createError({ statusCode: 400, message: 'Missing DID or rkey parameter' })

  const agent = await getPdsAgent(did)
  const res = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: COLLECTION_NSID,
    rkey,
  })

  const record = parseCollectionRecord(res.data.value)
  if (!record)
    throw createError({ statusCode: 422, message: 'Malformed collection record' })

  return {
    uri: res.data.uri,
    cid: res.data.cid,
    record,
  }
})
