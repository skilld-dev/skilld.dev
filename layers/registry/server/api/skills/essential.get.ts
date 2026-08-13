import { getDB } from '#server/utils/db'

/**
 * The skills that clear the highest bar, one per author.
 *
 * Powers `/skills/best`. Ordering is `seo_index_score` then stars, which is the
 * same signal the registry already uses to decide what is worth indexing:
 * provenance, a resolvable source, a real description, official or
 * trusted-curator standing. No new ranking was invented for this page, so the
 * order stays reconstructible from data already on the row.
 *
 * One skill per owner. Without that, a single prolific repo takes the whole
 * list and the page becomes a mirror of that repo rather than a judgement.
 */

interface Row {
  owner: string
  repo: string
  name: string
  display_name: string
  description: string | null
  stars: number
  trust_tier: string
  score: number
}

/**
 * Enough to be useful, small enough that a human could stand behind every row.
 * The ranking articles this competes with list 5 to 20; beyond that the page
 * stops being a judgement and starts being a dump, which is the scaled-content
 * failure principle 2 exists to prevent.
 */
const LIMIT = 24

export default defineCachedEventHandler(async (event) => {
  const db = getDB(event)

  // `MAX(...)` with bare columns is SQLite's documented "pick the row that
  // holds the max" behaviour, which is how one skill per owner is chosen. The
  // obvious alternative, a correlated per-owner MAX subquery, read 578k rows
  // against production for the same answer.
  const res = await db.prepare(`
    SELECT s.owner, s.repo, s.name, s.display_name, s.description,
           r.stars, s.trust_tier, MAX(s.seo_index_score) AS score
    FROM skills s
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
    WHERE s.seo_indexable = 1
      AND r.broken_since IS NULL
      AND s.description IS NOT NULL
      AND TRIM(s.description) != ''
      AND s.trust_tier IN ('official', 'trusted-curator', 'trusted-author')
    GROUP BY s.owner
    ORDER BY score DESC, r.stars DESC, s.name ASC
    LIMIT ?
  `).bind(LIMIT).all<Row>()

  const items = (res.results ?? []).map(row => ({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    stars: row.stars,
    trustTier: row.trust_tier,
  }))

  return { items, total: items.length }
}, {
  maxAge: 300,
  swr: false,
  name: 'skills-essential-v1',
})
