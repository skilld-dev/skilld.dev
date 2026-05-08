import { requireAdmin } from '../../../utils/admin'

interface Row {
  id: number
  skill_slug: string
  platform: 'twitter' | 'bsky'
  post_url: string
  author_handle: string
  author_display_name: string | null
  author_avatar: string | null
  role: 'author' | 'community'
  status: 'pending' | 'approved' | 'rejected'
  text_extract: string
  posted_at: number | null
  fetched_at: number
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const status = (getQuery(event).status as string) || 'pending'
  const db = getDB(event)
  const { results } = await db
    .prepare(`
      SELECT id, skill_slug, platform, post_url, author_handle,
             author_display_name, author_avatar, role, status,
             text_extract, posted_at, fetched_at
      FROM skill_social_posts
      WHERE status = ?
      ORDER BY fetched_at DESC
      LIMIT 200
    `)
    .bind(status)
    .all<Row>()
  return { posts: results ?? [] }
})
