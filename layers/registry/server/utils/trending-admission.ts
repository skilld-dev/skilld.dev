/**
 * SEO EXPERIMENT, started 2026-09-30. Gate: 2026-11-11.
 *
 * THE RULE. A Skill page is indexable only if the Skill has appeared on a
 * trending board (`week`, `month` or `all` on `/skills/trending`) and it
 * already passes the quality score (`seo_indexable`). Every other Skill page is
 * `noindex,follow` and absent from the skills sitemap. This file owns the rule.
 * The Skill API, the sitemap, and the admission job all read it from here.
 *
 * WHY. Google holds 1,433 curated URLs as "Discovered, currently not indexed"
 * and about 52k old URLs as "Crawled, currently not indexed". It crawls about
 * 29 HTML pages a day. A smaller set of pages that people demonstrably want
 * gives Google fewer, better reasons to crawl. See
 * `notes/skilld-seo-death-zone-2026-09-30.md`.
 *
 * ADDITIVE. Trending boards change weekly, and a page that flips between index
 * and noindex confuses Google. A Skill that entered the set stays in it until
 * the gate. `skill_trending_admissions` holds the set, with `admitted_at`.
 *
 * TARGET QUERY. The Skill's name plus "skill" (for example "caveman skill").
 * ADMISSION BAR. Named on a trending board, plus the existing quality score.
 *
 * CULL PATH. To end the experiment, make `isSkillIndexable` ignore
 * `trending_admitted`, delete `SKILL_ADMITTED_SQL` from the two queries in
 * `skills-registry.ts`, drop the `admit-trending-skills` task, and drop the
 * table. To cull only the set, run `DELETE FROM skill_trending_admissions`.
 * At the gate, keep, widen, or revert on the panel result.
 */

import { loadTrendingBoard } from '#shared/server/trending-board'
import { TRENDING_BOARD_LIMIT, trendingRangeMeta } from '#shared/trending-range'
import { SKILLS_LEADERBOARD_PAGE_SIZE, SKILLS_LEADERBOARD_PAGE_SQL } from './skills-leaderboard'

export const TRENDING_EXPERIMENT_GATE = '2026-11-11'

export type TrendingBoardName = 'week' | 'month' | 'all'

export interface SkillRef {
  owner: string
  repo: string
  name: string
}

export interface BoardSighting {
  board: TrendingBoardName
  skill: SkillRef
}

export interface Admission {
  skill: SkillRef
  firstBoard: TrendingBoardName
}

export function admissionKey(skill: SkillRef): string {
  return `${skill.owner}/${skill.repo}/${skill.name}`
}

/**
 * The Skills a run must add, given what it saw and what is already admitted.
 *
 * Pure. A Skill already admitted is never returned, so a sighting can only
 * grow the set. The first board to name a Skill in the run wins the label.
 */
export function planAdmissions(
  admitted: ReadonlySet<string>,
  sightings: readonly BoardSighting[],
): Admission[] {
  const planned = new Map<string, Admission>()
  for (const { board, skill } of sightings) {
    const key = admissionKey(skill)
    if (admitted.has(key) || planned.has(key))
      continue
    planned.set(key, { skill, firstBoard: board })
  }
  return [...planned.values()]
}

/** True when a `skills s` row has been admitted. The one admission clause. */
export const SKILL_ADMITTED_SQL = `EXISTS (
  SELECT 1 FROM skill_trending_admissions adm
  WHERE adm.owner = s.owner AND adm.repo = s.repo AND adm.name = s.name
)`

/**
 * Columns a `skills s JOIN repos r` read adds to call `isSkillIndexable`.
 * `s.seo_indexable` is already in the shared Skill select.
 */
export const SKILL_INDEX_INPUT_COLUMNS_SQL = `${SKILL_ADMITTED_SQL} AS trending_admitted,
  r.repo_kind`

export interface SkillIndexInput {
  seo_indexable: number | null
  trending_admitted: number | null
  repo_kind: string | null
}

/**
 * Whether the Skill page is `index,follow`. The sitemap lists the same set.
 *
 * Aggregator repositories stay out because the sitemap has always excluded
 * them. The page now says the same.
 */
export function isSkillIndexable(input: SkillIndexInput): boolean {
  return input.seo_indexable === 1
    && input.trending_admitted === 1
    && input.repo_kind !== 'aggregator'
}

/**
 * Every Skill on a trending board right now, per board.
 *
 * `week` and `month` read the board loader the feed endpoint uses, at the same
 * window and row limit, so this counts the rows a reader sees. `all` is page 1
 * of the reviewed-repository board, one top Skill per repository.
 */
export async function loadBoardSightings(db: D1Database, now: number): Promise<BoardSighting[]> {
  const sightings: BoardSighting[] = []

  for (const board of ['week', 'month'] as const) {
    const windowHours = trendingRangeMeta(board).windowHours
    if (windowHours === null)
      continue
    const { namedSkills, fallback } = await loadTrendingBoard({
      db,
      now,
      limit: TRENDING_BOARD_LIMIT,
      windowHours,
    })
    for (const entry of namedSkills)
      sightings.push({ board, skill: { owner: entry.owner, repo: entry.repo, name: entry.slug } })
    for (const entry of fallback)
      sightings.push({ board, skill: { owner: entry.owner, repo: entry.repo, name: entry.slug } })
  }

  const allRows = (await db
    .prepare(SKILLS_LEADERBOARD_PAGE_SQL)
    .bind(SKILLS_LEADERBOARD_PAGE_SIZE, 0)
    .all<{ owner: string, repo: string, top_skill_name: string }>()).results ?? []
  for (const row of allRows)
    sightings.push({ board: 'all', skill: { owner: row.owner, repo: row.repo, name: row.top_skill_name } })

  return sightings
}

async function loadAdmittedKeys(db: D1Database): Promise<Set<string>> {
  const rows = (await db
    .prepare('SELECT owner, repo, name FROM skill_trending_admissions')
    .all<SkillRef>()).results ?? []
  return new Set(rows.map(admissionKey))
}

/**
 * Add today's trending Skills to the admitted set. Never removes one.
 *
 * `INSERT OR IGNORE` makes a replay harmless. Returns the Skills it added.
 */
export async function admitTrendingSkills(db: D1Database, now: number): Promise<Admission[]> {
  const [admitted, sightings] = await Promise.all([loadAdmittedKeys(db), loadBoardSightings(db, now)])
  const admissions = planAdmissions(admitted, sightings)
  if (admissions.length === 0)
    return []

  const statements = admissions.map(({ skill, firstBoard }) => db
    .prepare(`INSERT OR IGNORE INTO skill_trending_admissions (owner, repo, name, admitted_at, first_board)
              VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(skill.owner, skill.repo, skill.name, now, firstBoard))
  await db.batch(statements)
  return admissions
}
