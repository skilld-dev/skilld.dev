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
      `SELECT c.id, u.login AS author_login, u.name AS author_name, u.avatar AS author_avatar,
              c.slug, c.name, c.preamble, c.featured, c.created_at, c.updated_at
       FROM collections_v2 c
       JOIN users u ON u.id = c.author_user_id
       WHERE u.login = ? AND c.slug = ? AND c.deleted_at IS NULL
       LIMIT 1`,
    ).bind(login, slug).first<CollectionDetailRow>()

    if (!collection)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    // The CTE is limited to the collection's repositories. Unfiltered, it ranked
    // every Skill in the registry and ran the correlated repo count for each,
    // about 1.69M rows read per call. `rn` partitions by repository, so the
    // filter leaves every rank unchanged.
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
           AND (s.owner, s.repo) IN (
             SELECT owner, repo FROM collection_skills_v2 WHERE collection_id = ?1
           )
       )
       SELECT cs.position, cs.owner, cs.repo, rs.name, rs.display_name, cs.reason,
              (SELECT COUNT(*) FROM skills repo_skills
               WHERE repo_skills.owner = cs.owner
                 AND repo_skills.repo = cs.repo
                 AND repo_skills.source_resolved = 1) AS repo_skill_count
       FROM collection_skills_v2 cs
       JOIN ranked_skills rs
         ON rs.owner = cs.owner
        AND rs.repo = cs.repo
        AND (
          (cs.name IS NOT NULL AND rs.name = cs.name)
          OR (cs.name IS NULL AND rs.rn = 1)
        )
       WHERE cs.collection_id = ?1
       ORDER BY cs.position ASC`,
    ).bind(collection.id).all<CollectionSkillRow>()

    return collectionDetailPresenter(collection, skillsRes.results ?? [])
  },
})
