/**
 * Daily star totals for the repositories on a board, for its sparklines.
 *
 * Reads `repo_star_observations`, which metadata sync fills with one exact
 * total per repository per UTC day. A day without a sync has no row, and the
 * series skips it rather than inventing a value.
 */

import type { StarPoint } from '#shared/trending-range'

/** Two bound parameters per repository, plus the cutoff, under D1's ceiling of 100. */
const REPOS_PER_QUERY = 49

/** Lookup key for a series. Case-insensitive, so a caller need not match the stored case. */
export function starSeriesKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`
}

export async function loadStarSeries(
  db: D1Database,
  repos: readonly { owner: string, repo: string }[],
  sinceDay: number,
): Promise<Map<string, StarPoint[]>> {
  const out = new Map<string, StarPoint[]>()
  const unique = [...new Map(repos.map(entry => [starSeriesKey(entry.owner, entry.repo), entry])).values()]

  for (let i = 0; i < unique.length; i += REPOS_PER_QUERY) {
    const chunk = unique.slice(i, i + REPOS_PER_QUERY)
    const placeholders = chunk.map((_, j) => `(?${j * 2 + 2}, ?${j * 2 + 3})`).join(', ')
    const rows = (await db
      .prepare(
        `SELECT owner, repo, observed_day, stars
         FROM repo_star_observations
         WHERE observed_day >= ?1
           AND (owner, repo) IN (VALUES ${placeholders})
         ORDER BY owner, repo, observed_day`,
      )
      // The stored case, as given. Observations keep GitHub's case from `repos`,
      // and lowercasing here dropped every mixed-case repository's sparkline.
      .bind(sinceDay, ...chunk.flatMap(entry => [entry.owner, entry.repo]))
      .all<{ owner: string, repo: string, observed_day: number, stars: number }>()).results ?? []

    for (const row of rows) {
      const key = starSeriesKey(row.owner, row.repo)
      const series = out.get(key) ?? []
      series.push({ day: row.observed_day, stars: row.stars })
      out.set(key, series)
    }
  }

  return out
}
