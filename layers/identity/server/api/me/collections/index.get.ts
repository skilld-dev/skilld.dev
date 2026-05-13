import { CollectionSummarySchema } from 'skilld-protocol/wire'
import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { requireUserRow } from '../../../utils/users'

interface Row {
  slug: string
  name: string
  skill_count: number
}

export default defineApiHandler({
  policy: [authenticated],
  response: z.array(CollectionSummarySchema),
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const res = await platform.db.prepare(
      `SELECT c.slug, c.name,
              (SELECT COUNT(*) FROM collection_skills_v2 cs WHERE cs.collection_id = c.id) AS skill_count
       FROM collections_v2 c
       WHERE c.author_user_id = ?1
         AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
    ).bind(u.id).all<Row>()

    return (res.results ?? []).map(row => ({
      slug: row.slug,
      name: row.name,
      itemCount: row.skill_count,
    }))
  },
})
