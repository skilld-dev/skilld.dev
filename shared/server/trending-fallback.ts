/**
 * Fill the trending page when X has not given us enough.
 *
 * X discovery is inherently lumpy: on a quiet day the verified set is a
 * handful of entries, which leaves the page thin and, below eight entries,
 * self-excluded from the index. Stars are the signal we already collect for
 * every tracked repo, they need no API budget, and they never run dry.
 *
 * A fallback entry is a weaker claim than a trending one and is labelled as
 * such by the caller. It says "popular on GitHub", not "people are posting
 * about this", and the two must not be presented as the same thing.
 *
 * ONE SKILL PER REPO, CHOSEN DETERMINISTICALLY. A repo is not a skill, so the
 * row needs a specific skill to point at. The pick is arbitrary but stable
 * rather than random: a genuinely random choice would change on every request,
 * break edge caching, and make the page shuffle under the reader.
 */

import { canonicalRepoSkillPath } from '#shared/skill-routes'

export interface FallbackSkill {
  owner: string
  repo: string
  slug: string
  canonicalName: string
  description: string | null
  stars: number
  /** Skills the repo holds, so the row can say "1 of 6". */
  repoSkillCount: number
  /** Final public route. Consumers must not reconstruct it from other fields. */
  registryPath: string
  /** Stars gained on the latest surge day, when there was one. */
  starsGained: number | null
}

export interface LoadFallbackOptions {
  db: D1Database
  /** Unix seconds. */
  now: number
  limit: number
  /** Repos already on the page, as `owner/repo`, so entries never duplicate. */
  exclude?: ReadonlySet<string>
  /** Ignore repos below this, so the filler is genuinely notable. */
  minStars?: number
  /** Keep these familiar repositories eligible, but place discoveries first. */
  deprioritizeRepositories?: ReadonlySet<string>
}

export const DEFAULT_FALLBACK_MIN_STARS = 100

interface FallbackRow {
  owner: string
  repo: string
  slug: string
  canonical_name: string
  description: string | null
  stars: number
  repo_skill_count: number
  stars_gained: number | null
}

/**
 * Popular indexed repos, one skill each, strongest first.
 *
 * Ordered by any recent star surge before raw star count, so a repo that is
 * moving now outranks one that has simply been large for years. `MIN(name)`
 * picks the skill: arbitrary, but the same arbitrary choice on every request.
 */
export async function loadFallbackSkills(
  options: LoadFallbackOptions,
): Promise<FallbackSkill[]> {
  const minStars = options.minStars ?? DEFAULT_FALLBACK_MIN_STARS
  const exclude = options.exclude ?? new Set<string>()
  // Over-fetch so exclusions cannot return a short page.
  const deprioritized = options.deprioritizeRepositories ?? new Set<string>()
  const fetchLimit = options.limit + exclude.size + deprioritized.size

  const rows = (await options.db
    .prepare(
      `SELECT r.owner, r.repo, r.stars,
              s.name AS slug, s.display_name AS canonical_name, s.description,
              (SELECT COUNT(*) FROM skills c
                WHERE c.owner = r.owner AND c.repo = r.repo AND c.source_resolved = 1
              ) AS repo_skill_count,
              (SELECT MAX(g.latest_gain) FROM repo_star_surges g
                WHERE g.owner = r.owner AND g.repo = r.repo
                  AND g.observed_day >= ?1
              ) AS stars_gained
       FROM repos r
       JOIN skills s
         ON s.owner = r.owner AND s.repo = r.repo AND s.source_resolved = 1
        AND s.name = (
          SELECT MIN(p.name) FROM skills p
          WHERE p.owner = r.owner AND p.repo = r.repo AND p.source_resolved = 1
        )
       WHERE r.stars >= ?2
       ORDER BY stars_gained DESC NULLS LAST, r.stars DESC
       LIMIT ?3`,
    )
    .bind(options.now - 7 * 24 * 3600, minStars, fetchLimit)
    .all<FallbackRow>()).results ?? []

  const preferredRows = [...rows]
    .sort((left, right) => Number(deprioritized.has(`${left.owner}/${left.repo}`)) - Number(deprioritized.has(`${right.owner}/${right.repo}`)))
  const out: FallbackSkill[] = []
  for (const row of preferredRows) {
    if (exclude.has(`${row.owner}/${row.repo}`))
      continue
    out.push({
      owner: row.owner,
      repo: row.repo,
      slug: row.slug,
      canonicalName: row.canonical_name || row.slug,
      description: row.description,
      stars: row.stars,
      repoSkillCount: row.repo_skill_count,
      registryPath: canonicalRepoSkillPath({
        owner: row.owner,
        repo: row.repo,
        name: row.slug,
        repoSkillCount: row.repo_skill_count,
      }),
      starsGained: row.stars_gained,
    })
    if (out.length >= options.limit)
      break
  }
  return out
}
