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
      `WITH ranked_skills AS (
         SELECT s.owner, s.repo, s.name, s.target_package,
                ROW_NUMBER() OVER (
                  PARTITION BY s.owner, s.repo
                  ORDER BY s.installs DESC, s.name ASC
                ) AS rn
         FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE (r.broken_since IS NULL OR r.broken_since > unixepoch() - 604800)
           AND s.source_resolved = 1
           AND s.rendered_status = 'ok'
       )
       SELECT cs.owner, cs.repo, rs.name, cs.position,
              rs.target_package
       FROM collection_skills_v2 cs
       JOIN ranked_skills rs
         ON rs.owner = cs.owner
        AND rs.repo = cs.repo
        AND (
          (cs.name IS NOT NULL AND rs.name = cs.name)
          OR (cs.name IS NULL AND rs.rn = 1)
        )
       WHERE cs.collection_id = ?1
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
