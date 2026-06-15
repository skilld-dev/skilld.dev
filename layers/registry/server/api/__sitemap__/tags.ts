import { getDB } from '~~/shared/server/db'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { getTagRedirect } from '../../utils/tag-quality'

export default defineSitemapEventHandler(async (event) => {
  const db = getDB(event)
  // Derived tags are sitemap-eligible only when the curation audit kept them
  // (migration 0064). Replaces the blunt ">=10 skills" heuristic that flooded
  // the index with thin AI tag pages.
  const kept = await db
    .prepare(`SELECT slug FROM tag_decisions WHERE keep = 1`)
    .all<{ slug: string }>()

  const slugs = new Set<string>()

  // Controlled vocab is trusted, but still skip slugs that redirect to a
  // canonical marketing page so we never list the redirecting URL.
  for (const slug of TAG_BY_SLUG.keys()) {
    if (!getTagRedirect(slug))
      slugs.add(slug)
  }

  for (const row of kept.results ?? []) {
    if (typeof row.slug === 'string' && !getTagRedirect(row.slug))
      slugs.add(row.slug)
  }

  return [...slugs].map(slug => ({
    loc: `/skills/tag/${slug}`,
    changefreq: 'weekly' as const,
  }))
})
