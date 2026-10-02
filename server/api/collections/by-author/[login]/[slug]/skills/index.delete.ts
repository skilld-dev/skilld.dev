import { authenticated } from '~~/server/policies/authenticated'
import { CollectionSkillRefInput } from '~~/server/schemas/collection-skill-input'
import { findAuthorCollectionId } from '~~/server/utils/collections'
import { enqueueSkillDirtyStatement } from '~~/server/utils/skill-dirty'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: CollectionSkillRefInput,
  policy: [authenticated],
  handler: async ({ event, body, platform, user }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const slug = getRouterParam(event, 'slug') ?? ''
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })
    if (login !== user!.login)
      throw createError({ statusCode: 403, message: 'Not your collection' })

    const collectionId = await findAuthorCollectionId(platform.db, user!.id, slug)
    if (collectionId === null)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    const now = Math.floor(Date.now() / 1000)
    const stmts = [
      platform.db.prepare(
        `DELETE FROM collection_skills_v2
         WHERE collection_id = ?1 AND owner = ?2 AND repo = ?3
           AND (name IS ?4 OR name = ?4)`,
      ).bind(collectionId, body.owner, body.repo, body.name),
      platform.db.prepare(
        `UPDATE collections_v2 SET updated_at = ? WHERE id = ?`,
      ).bind(now, collectionId),
    ]
    // Mirror the post handler: only the named rows feed the curator-count
    // formula, so a NULL-name delete leaves counters unaffected.
    if (body.name) {
      stmts.push(enqueueSkillDirtyStatement(platform.db, {
        owner: body.owner,
        repo: body.repo,
        name: body.name,
        reason: 'curator',
      }))
    }
    await platform.db.batch(stmts)

    return { ok: true }
  },
})
