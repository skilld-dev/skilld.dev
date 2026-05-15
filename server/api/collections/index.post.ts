import { authenticated } from '~~/server/policies/authenticated'
import { createdCollectionPresenter } from '~~/server/presenters/collection'
import { CreateCollectionInput } from '~~/server/schemas/collection-input'
import { enqueueSkillDirtyStatement } from '~~/server/utils/skill-dirty'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: CreateCollectionInput,
  policy: [authenticated],
  presenter: createdCollectionPresenter,
  handler: async ({ body, platform, user }) => {
    const { db } = platform
    const userId = user!.id
    const { slug, name, preamble, skills } = body
    const now = Math.floor(Date.now() / 1000)

    const existing = await db.prepare(
      `SELECT id FROM collections_v2 WHERE author_user_id = ?1 AND slug = ?2`,
    ).bind(userId, slug).first<{ id: number }>()
    if (existing)
      throw createError({ statusCode: 409, message: 'Slug already in use' })

    const insert = await db.prepare(
      `INSERT INTO collections_v2 (author_user_id, slug, name, preamble, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       RETURNING id`,
    ).bind(userId, slug, name, preamble, now).first<{ id: number }>()
    if (!insert)
      throw createError({ statusCode: 500, message: 'Insert failed' })

    if (skills.length) {
      const stmts = skills.flatMap((s, i) => {
        const row = [db.prepare(
          `INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name, reason)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        ).bind(insert.id, i, s.owner, s.repo, s.name ?? null, s.reason ?? null)]
        // Only enqueue when name is concrete — NULL-name rows don't feed the
        // curator-count formula (NULL = NULL is false in the integrity check).
        if (s.name) {
          row.push(enqueueSkillDirtyStatement(db, {
            owner: s.owner,
            repo: s.repo,
            name: s.name,
            reason: 'curator',
          }))
        }
        return row
      })
      await db.batch(stmts)
    }

    return { id: insert.id, login: user!.login as string, slug }
  },
})
