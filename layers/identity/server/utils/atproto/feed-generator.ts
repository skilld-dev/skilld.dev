/**
 * Feed generator for surfacing skilld.dev collections inside Bluesky.
 * Serves a "New Collections" feed from the D1 collections index.
 */

/// <reference types="@cloudflare/workers-types" />

export const FEED_URI_PATH = 'skilld-new-collections'

interface FeedSkeleton {
  feed: Array<{ post: string }>
  cursor?: string
}

interface CollectionPostRow {
  post_uri: string
  updated_at: number
}

/**
 * Build a feed skeleton from recent collection posts.
 * Reads from the D1 collections index, dropping the previous PDS fan-out.
 */
export async function getCollectionsFeedSkeleton(
  db: D1Database,
  opts?: { limit?: number, cursor?: string },
): Promise<FeedSkeleton> {
  const limit = Math.min(opts?.limit ?? 30, 50)
  // Cursor is the last entry's updated_at as ISO; convert to unix seconds.
  const cursorSec = opts?.cursor
    ? Math.floor(Date.parse(opts.cursor) / 1000)
    : null

  const where = cursorSec !== null
    ? 'WHERE deleted_at IS NULL AND post_uri IS NOT NULL AND updated_at < ?'
    : 'WHERE deleted_at IS NULL AND post_uri IS NOT NULL'

  const stmt = db.prepare(`
    SELECT post_uri, updated_at
    FROM collections
    ${where}
    ORDER BY updated_at DESC
    LIMIT ?
  `)

  const bound = cursorSec !== null
    ? stmt.bind(cursorSec, limit)
    : stmt.bind(limit)

  const res = await bound.all<CollectionPostRow>()
  const rows = res.results ?? []

  return {
    feed: rows.map(r => ({ post: r.post_uri })),
    cursor: rows.at(-1)
      ? new Date(rows.at(-1)!.updated_at * 1000).toISOString()
      : undefined,
  }
}
