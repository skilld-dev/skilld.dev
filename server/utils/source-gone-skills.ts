/// <reference types="@cloudflare/workers-types" />

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
