import { GONE_SKILLS_SQL } from '~~/server/utils/source-gone-skills'
import { getDB } from '#server/utils/db'
import retiredUrls from '../../data/retired-urls.json'
import { buildRetiredSitemapEntries, isRetiredSitemapActive } from '../../utils/retired-sitemap'
import { MARKETING_REDIRECTS } from '../../utils/tag-quality'

// Temporary sitemap of retired URLs. Experiment E, remove 2026-11-11. The
// reasons, the status guarantee and the removal steps are in
// `../../utils/retired-sitemap.ts`.
export default defineSitemapEventHandler(async (event) => {
  // Past the removal date, skip the D1 queries too.
  const now = new Date()
  if (!isRetiredSitemapActive(now))
    return []

  const db = getDB(event)
  const [gone, collections] = await Promise.all([
    db.prepare(GONE_SKILLS_SQL).all<{ owner: string, repo: string, name: string }>(),
    db.prepare(`
      SELECT u.login, c.slug
      FROM collections_v2 c
      JOIN users u ON u.id = c.author_user_id
      WHERE c.deleted_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM collections_v2 live
          WHERE live.author_user_id = c.author_user_id AND live.slug = c.slug AND live.deleted_at IS NULL
        )
    `).all<{ login: string, slug: string }>(),
  ])

  return buildRetiredSitemapEntries({
    now,
    goneSkillPaths: (gone.results ?? []).map(row => `/gh/${row.owner}/${row.repo}/${row.name}`),
    deletedCollectionPaths: (collections.results ?? []).map(row => `/@${row.login}/${row.slug}`),
    // Tag pages that hand off to a category: a static 301 each.
    probedPaths: [...retiredUrls.paths, ...Object.keys(MARKETING_REDIRECTS).map(slug => `/skills/tag/${slug}`)],
  })
})
