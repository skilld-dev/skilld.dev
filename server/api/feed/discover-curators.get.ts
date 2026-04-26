/**
 * Empty-state CTA list: curators tagged `early-curator`, sorted by recency.
 * Powers the "Your network hasn't picked anything yet" surface on the homepage.
 */

import type { IndexedCurator } from '../../utils/atproto/curator-index'

interface CuratorRow {
  did: string
  handle: string
  display_name: string | null
  avatar: string | null
  collection_count: number
  first_published: string
  last_published: string
  labels: string
  last_profile_refresh: string | null
}

const LIMIT = 8

export default defineCachedEventHandler(async (event) => {
  const db = getDB(event)
  const res = await db.prepare(`
    SELECT * FROM curators
    WHERE labels LIKE '%early-curator%'
    ORDER BY last_published DESC
    LIMIT ?
  `).bind(LIMIT).all<CuratorRow>()

  const curators: IndexedCurator[] = (res.results ?? []).map(row => ({
    did: row.did,
    handle: row.handle,
    displayName: row.display_name ?? undefined,
    avatar: row.avatar ?? undefined,
    collectionCount: row.collection_count,
    firstPublished: row.first_published,
    lastPublished: row.last_published,
    labels: JSON.parse(row.labels),
    lastProfileRefresh: row.last_profile_refresh ?? undefined,
  }))

  return { curators }
}, {
  maxAge: 60 * 5,
  swr: true,
  getKey: () => 'feed:discover-curators:v1',
})
