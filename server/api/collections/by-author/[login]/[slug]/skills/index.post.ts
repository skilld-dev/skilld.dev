import { authenticated } from '~~/server/policies/authenticated'
import { CollectionSkillRefInput } from '~~/server/schemas/collection-skill-input'
import { enqueueSkillDirtyStatement } from '~~/server/utils/skill-dirty'
import { defineApiHandler } from '#shared/server/handler'

interface CollectionRow {
  id: number
  author_user_id: number
}

interface PositionRow {
  next_position: number
}

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

    const collection = await platform.db.prepare(
      `SELECT id, author_user_id FROM collections_v2
       WHERE slug = ? AND author_user_id = ? AND deleted_at IS NULL LIMIT 1`,
    ).bind(slug, user!.id).first<CollectionRow>()
    if (!collection)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    const dupe = await platform.db.prepare(
      `SELECT 1 FROM collection_skills_v2
       WHERE collection_id = ?1 AND owner = ?2 AND repo = ?3
         AND (name IS ?4 OR name = ?4)`,
    ).bind(collection.id, body.owner, body.repo, body.name).first()
    if (dupe)
      return { ok: true, alreadyPresent: true }

    const next = await platform.db.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM collection_skills_v2 WHERE collection_id = ?`,
    ).bind(collection.id).first<PositionRow>()

    const now = Math.floor(Date.now() / 1000)
    const stmts = [
      platform.db.prepare(
        `INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name, reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(collection.id, next?.next_position ?? 0, body.owner, body.repo, body.name, body.reason),
      platform.db.prepare(
        `UPDATE collections_v2 SET updated_at = ? WHERE id = ?`,
      ).bind(now, collection.id),
    ]
    // NULL name rows don't participate in the curator-count formula (NULL =
    // NULL is false), so we only enqueue when we have a concrete name to
    // recompute against.
    if (body.name) {
      stmts.push(enqueueSkillDirtyStatement(platform.db, {
        owner: body.owner,
        repo: body.repo,
        name: body.name,
        reason: 'curator',
      }))
    }
    await platform.db.batch(stmts)

    return { ok: true, alreadyPresent: false }
  },
})
