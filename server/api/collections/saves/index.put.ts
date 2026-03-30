import type { SaveRecord } from '../../../utils/atproto/lexicons/save'
import { TID } from '@atproto/common'
import { getAuthenticatedAgent } from '../../../utils/atproto/agent'
import { SAVE_NSID } from '../../../utils/atproto/lexicons/save'

/** Save a collection (private bookmark). */
export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)
  const body = await readBody(event)

  if (!body?.subject?.uri || !body?.subject?.cid)
    throw createError({ statusCode: 400, message: 'subject.uri and subject.cid are required' })

  // Check if already saved by listing existing saves and matching URI
  const existing = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SAVE_NSID,
    limit: 100,
  })

  const alreadySaved = existing.data.records.find((r) => {
    const val = r.value as Record<string, unknown>
    const subject = val.subject as Record<string, unknown> | undefined
    return subject?.uri === body.subject.uri
  })

  if (alreadySaved) {
    return { uri: alreadySaved.uri, alreadyExisted: true }
  }

  const record: SaveRecord = {
    $type: SAVE_NSID,
    subject: {
      uri: body.subject.uri,
      cid: body.subject.cid,
    },
    createdAt: new Date().toISOString(),
  }

  const rkey = TID.nextStr()
  const result = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: SAVE_NSID,
    rkey,
    record: record as unknown as Record<string, unknown>,
  })

  return { uri: result.data.uri, cid: result.data.cid }
})
