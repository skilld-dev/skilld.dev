import { FEED_URI_PATH, getCollectionsFeedSkeleton } from '../../utils/atproto/feed-generator'

/**
 * Feed generator endpoint. Bluesky calls this to get post URIs for the feed.
 * Register the feed by publishing an app.bsky.feed.generator record with
 * the DID of the server running this endpoint.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const feed = query.feed as string | undefined

  if (!feed?.endsWith(`/${FEED_URI_PATH}`))
    throw createError({ statusCode: 400, message: 'Unknown feed' })

  const limit = Math.min(Number(query.limit) || 30, 50)
  const cursor = query.cursor as string | undefined

  return getCollectionsFeedSkeleton({ limit, cursor })
})
