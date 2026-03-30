import { getAuthenticatedAgent } from '../../../utils/atproto/agent'
import { rkeyFromUri } from '../../../utils/atproto/collections'
import { parseSaveRecord, SAVE_NSID } from '../../../utils/atproto/lexicons/save'

/** List all saved collections for the authenticated user. */
export default defineEventHandler(async (event) => {
  const { agent, did } = await getAuthenticatedAgent(event)

  const saves: Array<{ uri: string, rkey: string, subject: { uri: string, cid: string }, createdAt: string }> = []
  let cursor: string | undefined

  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SAVE_NSID,
      limit: 100,
      cursor,
    })

    for (const record of res.data.records) {
      const parsed = parseSaveRecord(record.value)
      if (parsed) {
        const rkey = rkeyFromUri(record.uri)
        saves.push({
          uri: record.uri,
          rkey,
          subject: parsed.subject,
          createdAt: parsed.createdAt,
        })
      }
    }

    cursor = res.data.cursor
  } while (cursor)

  return { saves }
})
