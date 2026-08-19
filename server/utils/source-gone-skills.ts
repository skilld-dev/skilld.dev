/// <reference types="@cloudflare/workers-types" />

import type { ReadThroughCache } from '#shared/server/cache'
import { readCache, writeCache } from '#shared/server/cache'

/**
 * Skills whose SKILL.md was deleted upstream still serve a page, because the
 * cached render survives the deletion. The page is worth keeping: it shows the
 * last copy skilld indexed and says plainly that installing will fail. What is
 * wrong is the status code, because 200 tells a crawler the resource is live.
 *
 * The decision cannot live in `SkillDetail.vue`. Skill detail is fetched
 * client-side, so that component never runs during SSR; a `setResponseStatus`
 * there was deployed on 2026-08-05 and measured as having no effect at all.
 * Only a Nitro handler sees the request early enough to set the status.
 */

export interface GoneSkillRow {
  owner: string
  repo: string
  name: string
  slug: string | null
  /**
   * A repository already answers at `/gh/<owner>/<name>`. When that is true the
   * flat skill slug is ambiguous, and the repository page wins, so the flat key
   * is dropped rather than risk returning 410 for a live repository.
   */
  name_collides_with_repo: number | null
}

export const GONE_SKILLS_CACHE_KEY = 'skills:source-gone:v1'
export const GONE_SKILLS_CACHE_TTL = 60 * 60

export const GONE_SKILLS_SQL = `
  SELECT
    s.owner,
    s.repo,
    s.name,
    s.slug,
    EXISTS (
      SELECT 1 FROM repos r WHERE r.owner = s.owner AND r.repo = s.name
    ) AS name_collides_with_repo
  FROM skills s
  WHERE s.source_resolved = 0
`

/**
 * Both shapes a skill answers on: the flat `<owner>/<name>` slug and the full
 * `<owner>/<repo>/<name>` path. Lowercased because GitHub identifiers are
 * matched case-insensitively across the registry.
 */
export function goneSkillKeys(rows: readonly GoneSkillRow[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    keys.add(`${row.owner}/${row.repo}/${row.name}`.toLowerCase())
    if (row.slug && !row.name_collides_with_repo)
      keys.add(row.slug.toLowerCase())
  }
  return [...keys].sort()
}

/**
 * The registry identity a `/gh` path addresses, or null when the path is not a
 * skill at all. One segment is an owner and three or more past the skill are
 * sub-resources, neither of which this decides.
 */
export function skillKeyFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/gh/'))
    return null
  const rest = pathname.slice('/gh/'.length).replace(/\/+$/, '')
  if (!rest)
    return null
  const segments = rest.split('/')
  if (segments.length !== 2 && segments.length !== 3)
    return null
  if (segments.some(segment => !segment))
    return null
  return rest.toLowerCase()
}

export async function selectGoneSkillKeys(db: D1Database): Promise<string[]> {
  const rows = await db.prepare(GONE_SKILLS_SQL).bind().all<GoneSkillRow>()
  return goneSkillKeys(rows.results ?? [])
}

/**
 * The gone-skill key set for this request, or null when it cannot be resolved.
 *
 * This runs on every `/gh` request and its only job is to upgrade a 200 to a
 * 410. Neither the KV read nor the D1 fallback is worth the page. Workers KV
 * answered a `getItem` with `KV GET failed: 500 Internal Server Error` and the
 * rejection travelled out of the bare read-through cache here and 500'd the
 * page (Sentry SKILLD-S, `/gh/dylantarre/animation-principles/educator-teacher`,
 * still live 2026-08-18). The D1 read behind it fails the same way, and D1
 * answers `{"D1_RESET_DO":true}` on its own schedule (Sentry SKILLD-Y).
 *
 * Failing to resolve the set costs one stale 200 on a deleted skill until the
 * next request. Propagating the failure costs every `/gh` visitor the page.
 *
 * This is deliberately not a silent catch: the wide event carries the reason,
 * so an outage shows up as a spike in unresolved lookups rather than as
 * nothing at all.
 */
export async function resolveGoneSkillKeys(
  cache: ReadThroughCache,
  db: D1Database,
): Promise<string[] | null> {
  const cached = await readCache<string[]>(cache, GONE_SKILLS_CACHE_KEY)
  if (Array.isArray(cached))
    return cached

  try {
    const keys = await selectGoneSkillKeys(db)
    await writeCache(cache, GONE_SKILLS_CACHE_KEY, keys, { ttl: GONE_SKILLS_CACHE_TTL })
    return keys
  }
  catch (error) {
    emitOperationalEvent(createWideEvent({
      operation: 'source-gone-keys',
      outcome: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }))
    return null
  }
}
