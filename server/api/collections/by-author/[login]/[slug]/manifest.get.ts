import { CollectionManifestSchema } from 'skilld-protocol/wire'
import { defineApiHandler } from '#shared/server/handler'

interface ManifestRow {
  owner: string
  repo: string
  name: string
  position: number
  target_package: string | null
}

export default defineApiHandler({
  response: CollectionManifestSchema,
  handler: async ({ event, platform }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const slug = getRouterParam(event, 'slug') ?? ''
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })

    const collection = await platform.db.prepare(
      `SELECT c.id, c.name, c.preamble
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ?1
         AND c.slug = ?2
         AND c.deleted_at IS NULL
       LIMIT 1`,
    ).bind(login, slug).first<{ id: number, name: string, preamble: string | null }>()

    if (!collection)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    const res = await platform.db.prepare(
      `SELECT cs.owner, cs.repo, cs.name, cs.position,
              MIN(s.target_package) AS target_package
       FROM collection_skills_v2 cs
       LEFT JOIN skills s
         ON s.owner = cs.owner
        AND s.repo = cs.repo
        AND s.name = cs.name
        AND s.target_package IS NOT NULL
       WHERE cs.collection_id = ?1
       GROUP BY cs.owner, cs.repo, cs.name, cs.position
       ORDER BY cs.position`,
    ).bind(collection.id).all<ManifestRow>()

    const rows = res.results ?? []
    return {
      name: collection.name,
      preamble: collection.preamble ?? undefined,
      items: rows.map(row => row.target_package
        ? { kind: 'npm' as const, package: row.target_package }
        : { kind: 'gh' as const, owner: row.owner, repo: row.repo, name: row.name }),
    }
  },
})
