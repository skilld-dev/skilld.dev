/**
 * Feed generator for surfacing skilld.dev collections inside Bluesky.
 * Serves a "New Collections" feed from curator activity.
 */

/// <reference types="@cloudflare/workers-types" />
import { getPublicAgent } from './agent'
import { listCollectionRecords } from './collections'
import { getAllCurators } from './curator-index'

export const FEED_URI_PATH = 'skilld-new-collections'

interface FeedSkeleton {
  feed: Array<{ post: string }>
  cursor?: string
}

/**
 * Build a feed skeleton from recent collection posts.
 * Returns AT URIs of Bluesky posts linked from collection records via postRef.
 */
export async function getCollectionsFeedSkeleton(db: D1Database, opts?: { limit?: number, cursor?: string }): Promise<FeedSkeleton> {
  const limit = Math.min(opts?.limit ?? 30, 50)
  const cursorTime = opts?.cursor ? new Date(opts.cursor).getTime() : Infinity

  const curators = await getAllCurators(db)
  const agent = getPublicAgent()

  // Gather all collection records with postRefs
  const entries: Array<{ postUri: string, updatedAt: string }> = []

  await Promise.all(curators.map(async (curator) => {
    const records = await listCollectionRecords(agent, curator.did, 20).catch(() => [])

    for (const { record } of records) {
      if (!record.postRef)
        continue

      const time = new Date(record.updatedAt).getTime()
      if (time < cursorTime) {
        entries.push({ postUri: record.postRef.uri, updatedAt: record.updatedAt })
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
