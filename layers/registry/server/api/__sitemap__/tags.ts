import { getDB } from '~~/shared/server/db'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { DERIVED_TAG_MIN_SKILLS, getTagRedirect, isQualityDerivedTag } from '../../utils/tag-quality'

export default defineSitemapEventHandler(async (event) => {
  const db = getDB(event)
  const derived = await db
    .prepare(
      `SELECT je.value AS slug,
              COUNT(DISTINCT sg.owner || '/' || sg.repo || '/' || sg.name) AS n
       FROM skill_generated sg, json_each(sg.payload, '$.tags') je
       WHERE sg.kind = 'tags'
       GROUP BY je.value
       HAVING n >= ?`,
    )
    .bind(DERIVED_TAG_MIN_SKILLS)
    .all<{ slug: string, n: number }>()

  const slugs = new Set<string>()

  // Controlled vocab is trusted, but still skip slugs that redirect to a
  // canonical marketing page so we never list the redirecting URL.
  for (const slug of TAG_BY_SLUG.keys()) {
    if (!getTagRedirect(slug))
      slugs.add(slug)
  }

  for (const row of derived.results ?? []) {
    if (typeof row.slug === 'string' && isQualityDerivedTag(row.slug, row.n))
      slugs.add(row.slug)
  }

  return [...slugs].map(slug => ({
    loc: `/skills/tag/${slug}`,
    changefreq: 'weekly' as const,
  }))
})
