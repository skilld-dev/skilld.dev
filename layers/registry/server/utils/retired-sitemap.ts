/**
 * SEO EXPERIMENT E, started 2026-09-30. REMOVE ON 2026-11-11.
 *
 * A temporary `retired` sitemap. It lists URLs that now answer 301, 404 or 410,
 * each with a fresh `lastmod`, so Google recrawls them and drops them sooner.
 * Google holds about 52k old URLs as "Crawled, currently not indexed", and it
 * crawls about 29 HTML pages a day. Practitioner advice, not documented
 * policy: a temporary sitemap of changed URLs speeds up the purge.
 * Scale rule: "Crawled, currently not indexed" falls by 10k in 4 weeks.
 *
 * Every URL here must really answer 301, 404 or 410. A URL that answers 200
 * would advertise a live page as retired. The sources are Skills the gone
 * middleware answers 410 for, collections with `deleted_at` set, and paths
 * probed on the generation date (`data/retired-urls.json`).
 * `scripts/check-retired-sitemap.ts` re-probes the served sitemap.
 *
 * Do not submit it to Search Console until the owner decides to.
 *
 * REMOVAL. On 2026-11-11 delete `__sitemap__/retired.ts`, this file,
 * `data/retired-urls.json`, and the `retired` entry in `nuxt.config.ts`. The
 * handler already returns an empty list after that date, so a late removal
 * does no harm.
 */

export const RETIRED_SITEMAP_REMOVAL_DATE = '2026-11-11'

export interface RetiredSitemapEntry {
  loc: string
  lastmod: string
}

export interface RetiredSitemapInput {
  now: Date
  /** `/gh/<owner>/<repo>/<name>` paths of Skills whose SKILL.md is gone: 410. */
  goneSkillPaths: readonly string[]
  /** `/@<login>/<slug>` paths of deleted collections: 301 or 404. */
  deletedCollectionPaths: readonly string[]
  /** Paths probed on the generation date, each 301, 404 or 410. */
  probedPaths: readonly string[]
}

export function isRetiredSitemapActive(now: Date): boolean {
  return now.toISOString().slice(0, 10) < RETIRED_SITEMAP_REMOVAL_DATE
}

/**
 * The sitemap rows: deduplicated, sorted, all with today's date as `lastmod`.
 * After the removal date it returns nothing.
 */
export function buildRetiredSitemapEntries(input: RetiredSitemapInput): RetiredSitemapEntry[] {
  if (!isRetiredSitemapActive(input.now))
    return []
  const lastmod = input.now.toISOString()
  const paths = new Set<string>()
  for (const path of [...input.goneSkillPaths, ...input.deletedCollectionPaths, ...input.probedPaths]) {
    if (path.startsWith('/'))
      paths.add(path)
  }
  return [...paths].sort().map(loc => ({ loc, lastmod }))
}
