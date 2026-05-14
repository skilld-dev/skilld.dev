import { z } from 'zod'
import { authenticated } from '~~/server/policies/authenticated'
import { defineApiHandler } from '#shared/server/handler'

const Query = z.object({
  owner: z.string().trim().min(1).optional(),
  repo: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
})

interface Row {
  id: number
  slug: string
  name: string
  preamble: string | null
  updated_at: number
  skill_count: number
  has_skill: number | null
}

export default defineApiHandler({
  schema: Query,
  policy: [authenticated],
  handler: async ({ body, platform, user }) => {
    const { owner, repo, name } = body
    const probing = !!(owner && repo)

    const sql = `
      SELECT c.id, c.slug, c.name, c.preamble, c.updated_at,
             (SELECT COUNT(*) FROM collection_skills_v2 cs WHERE cs.collection_id = c.id) AS skill_count,
             ${probing
                ? `(SELECT 1 FROM collection_skills_v2 cs
                   WHERE cs.collection_id = c.id AND cs.owner = ?2 AND cs.repo = ?3
                     AND (cs.name IS ?4 OR cs.name = ?4) LIMIT 1)`
                : 'NULL'} AS has_skill
      FROM collections_v2 c
      WHERE c.author_user_id = ?1 AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC
    `
    const stmt = probing
      ? platform.db.prepare(sql).bind(user!.id, owner, repo, name ?? null)
      : platform.db.prepare(sql).bind(user!.id)
    const res = await stmt.all<Row>()

    return {
      login: user!.login,
      collections: (res.results ?? []).map(r => ({
        slug: r.slug,
        name: r.name,
        preamble: r.preamble,
        skillCount: r.skill_count,
        updatedAt: r.updated_at,
        hasSkill: probing ? !!r.has_skill : null,
      })),
    }
  },
})
