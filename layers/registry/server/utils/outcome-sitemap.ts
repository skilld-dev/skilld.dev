import { CLUSTERS } from '../data/clusters'

export interface OutcomeSitemapEntry {
  loc: string
  changefreq: 'weekly'
}

/**
 * Curated `/skills/*` pages that are not categories.
 *
 * nuxt.config excludes `/skills/**` from the pages sitemap, so a page listed
 * nowhere here is indexable but never announced. `/skills/best` is editorial,
 * not a category, so it has no row in CLUSTERS to be picked up from.
 */
const EDITORIAL_SKILL_PAGES = ['/skills/best']

export function listOutcomeSitemapEntries(): OutcomeSitemapEntry[] {
  return [
    ...CLUSTERS.map(cluster => `/skills/${cluster.slug}`),
    ...EDITORIAL_SKILL_PAGES,
  ].map(loc => ({ loc, changefreq: 'weekly' as const }))
}
