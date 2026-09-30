import { loadTrendingBoard } from '#shared/server/trending-board'
import { MIN_INDEXABLE_ROWS, TRENDING_BOARD_LIMIT, TRENDING_RANGES } from '#shared/trending-range'
import { SKILLS_LEADERBOARD_PAGE_SIZE, SKILLS_LEADERBOARD_PAGE_SQL } from './skills-leaderboard'

export interface TrendingSitemapEntry {
  loc: string
  changefreq: 'daily'
}

/**
 * The trending boards that render `index,follow`, as sitemap rows.
 *
 * `/skills/trending.vue` goes noindex when a board has fewer than
 * `MIN_INDEXABLE_ROWS` evidenced rows. The sitemap applies the same bar to the
 * same data, so it never lists a noindex board. The page also drops an owner
 * whose avatar fails to load, which can push a board just under the bar in the
 * browser only; the margin is one row.
 */
export async function listTrendingSitemapEntries(db: D1Database, now: number): Promise<TrendingSitemapEntry[]> {
  const entries: TrendingSitemapEntry[] = []
  for (const range of TRENDING_RANGES) {
    let evidenced: number
    if (range.windowHours === null) {
      const rows = (await db
        .prepare(SKILLS_LEADERBOARD_PAGE_SQL)
        .bind(SKILLS_LEADERBOARD_PAGE_SIZE, 0)
        .all()).results ?? []
      evidenced = rows.length
    }
    else {
      const board = await loadTrendingBoard({ db, now, limit: TRENDING_BOARD_LIMIT, windowHours: range.windowHours })
      evidenced = board.namedSkills.length
    }
    if (evidenced >= MIN_INDEXABLE_ROWS)
      entries.push({ loc: range.path, changefreq: 'daily' })
  }
  return entries
}
