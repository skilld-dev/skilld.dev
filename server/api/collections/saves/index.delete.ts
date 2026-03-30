import { getAuthenticatedAgent } from '../../../utils/atproto/agent'
import { rkeyFromUri } from '../../../utils/atproto/collections'
import { SAVE_NSID } from '../../../utils/atproto/lexicons/save'

/** Unsave a collection. Accepts { subjectUri } to find and delete the save record. */
export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)
  const body = await readBody(event)

  if (!body?.subjectUri)
    throw createError({ statusCode: 400, message: 'subjectUri is required' })

  // Find the save record matching this collection URI
  const existing = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SAVE_NSID,
    limit: 100,
  })

  const saveRecord = existing.data.records.find((r) => {
    const val = r.value as Record<string, unknown>
    const subject = val.subject as Record<string, unknown> | undefined
    return subject?.uri === body.subjectUri
  })

  if (!saveRecord)
    throw createError({ statusCode: 404, message: 'Save not found' })

  const rkey = rkeyFromUri(saveRecord.uri)

  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: SAVE_NSID,
    rkey,
  })

  return { success: true }
})
