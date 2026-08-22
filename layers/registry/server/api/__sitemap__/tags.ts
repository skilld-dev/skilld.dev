import { getDB } from '#server/utils/db'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { getTagRedirect } from '../../utils/tag-quality'

// 2026-08-22: tag pages are noindex sitewide (GOOGLE_RECOVERY.md, sitemap
// topology audit). 274 auto-list tag pages were 16% of the sitemap with no
// editorial text; on a suppressed site that is the scaled-content shape.
// Browse intent flows through the 12 category pages and frameworks hubs.
// Controlled vocab (taxonomy.ts) stays as the re-introduction allowlist:
// flip `keep` in tag_decisions for a tag that earns an editorial intro.
export default defineSitemapEventHandler(async (event) => {
  const db = getDB(event)
  // Editorial re-introductions only: a tag returns to the sitemap when a
  // human ticks it after writing its intro. The sub-agent bulk audit
  // (migration 0064) no longer qualifies a tag; its 257 keeps are void.
  const kept = await db
    .prepare(`SELECT slug FROM tag_decisions WHERE keep = 1`)
    .all<{ slug: string }>()

  const slugs = new Set<string>()
  for (const row of kept.results ?? []) {
    if (typeof row.slug === 'string' && !getTagRedirect(row.slug) && TAG_BY_SLUG.has(row.slug))
      slugs.add(row.slug)
  }

  return [...slugs].map(slug => ({
    loc: `/skills/tag/${slug}`,
    changefreq: 'weekly' as const,
  }))
})
