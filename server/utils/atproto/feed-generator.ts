/**
 * Feed generator for surfacing skilld.dev collections inside Bluesky.
 * Serves a "New Collections" feed from curator activity.
 */

import { getPublicAgent } from './agent'
import { getAllCurators } from './curator-index'
import { COLLECTION_NSID, parseCollectionRecord } from './lexicons/collection'

export const FEED_URI_PATH = 'skilld-new-collections'

interface FeedSkeleton {
  feed: Array<{ post: string }>
  cursor?: string
}

/**
 * Build a feed skeleton from recent collection posts.
 * Returns AT URIs of Bluesky posts linked from collection records via postRef.
 */
export async function getCollectionsFeedSkeleton(opts?: { limit?: number, cursor?: string }): Promise<FeedSkeleton> {
  const limit = Math.min(opts?.limit ?? 30, 50)
  const cursorTime = opts?.cursor ? new Date(opts.cursor).getTime() : Infinity

  const curators = await getAllCurators()
  const agent = getPublicAgent()

  // Gather all collection records with postRefs
  const entries: Array<{ postUri: string, updatedAt: string }> = []

  await Promise.all(curators.map(async (curator) => {
    const res = await agent.com.atproto.repo.listRecords({
      repo: curator.did,
      collection: COLLECTION_NSID,
      limit: 20,
    }).catch(() => null)

    if (!res?.data.records)
      return

    for (const record of res.data.records) {
      const val = parseCollectionRecord(record.value)
      if (!val?.postRef)
        continue

      const time = new Date(val.updatedAt).getTime()
      if (time < cursorTime) {
        entries.push({ postUri: val.postRef.uri, updatedAt: val.updatedAt })
      }
    }
  }))

  // Sort by most recent
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const page = entries.slice(0, limit)
  const lastEntry = page.at(-1)

  return {
    feed: page.map(e => ({ post: e.postUri })),
    cursor: lastEntry?.updatedAt,
  }
}
