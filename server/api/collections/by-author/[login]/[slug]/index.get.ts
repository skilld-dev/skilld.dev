import type { CollectionDetailRow, CollectionSkillRow } from '~~/server/presenters/collection'
import {
  collectionDetailPresenter,

} from '~~/server/presenters/collection'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const slug = getRouterParam(event, 'slug') ?? ''
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })

    const collection = await platform.db.prepare(
      `SELECT c.id, u.login AS author_login, c.slug, c.name, c.preamble, c.featured, c.created_at, c.updated_at
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ? AND c.slug = ? AND c.deleted_at IS NULL
       LIMIT 1`,
    ).bind(login, slug).first<CollectionDetailRow>()

    if (!collection)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    const skillsRes = await platform.db.prepare(
      `WITH ranked_skills AS (
         SELECT s.owner, s.repo, s.name, s.display_name,
                ROW_NUMBER() OVER (
                  PARTITION BY s.owner, s.repo
                  ORDER BY s.modified_at DESC, s.name ASC
                ) AS rn
         FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE (r.broken_since IS NULL OR r.broken_since > unixepoch() - 604800)
           AND s.source_resolved = 1
           AND s.rendered_status = 'ok'
       )
       SELECT cs.position, cs.owner, cs.repo, rs.name, rs.display_name, cs.reason
       FROM collection_skills_v2 cs
       JOIN ranked_skills rs
         ON rs.owner = cs.owner
        AND rs.repo = cs.repo
        AND (
          (cs.name IS NOT NULL AND rs.name = cs.name)
          OR (cs.name IS NULL AND rs.rn = 1)
        )
       WHERE cs.collection_id = ?
       ORDER BY cs.position ASC`,
    ).bind(collection.id).all<CollectionSkillRow>()

    return collectionDetailPresenter(collection, skillsRes.results ?? [])
  },
})
