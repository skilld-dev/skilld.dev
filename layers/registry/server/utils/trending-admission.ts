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
 * `trending_admitted`, replace `SKILL_INDEXABLE_SQL` in the two queries of
 * `skills-registry.ts` with `s.seo_indexable = 1`, drop the `admit-trending-skills` task, and drop the
 * table. To cull only the set, run `DELETE FROM skill_trending_admissions`.
 * At the gate, keep, widen, or revert on the panel result.
 */

import { loadTrendingBoard } from '#shared/server/trending-board'
import { TRENDING_BOARD_LIMIT, trendingRangeMeta } from '#shared/trending-range'
import { SKILLS_LEADERBOARD_PAGE_SIZE, SKILLS_LEADERBOARD_PAGE_SQL } from './skills-leaderboard'

export const TRENDING_EXPERIMENT_GATE = '2026-11-11'

export type TrendingBoardName = 'week' | 'month' | 'all'

/**
 * Probe exceptions for experiment D (trusted-host link probe), approved for
 * the same gate, 2026-11-11. Each is indexable whatever its quality score, so
 * harlanzw.com posts can link to a page Google may index. Cull path: empty
 * this list; `admit-trending-skills` never removes a row, so also
 * `DELETE FROM skill_trending_admissions WHERE first_board = 'probe'`.
 *
 * `harlan-zw/nuxt-seo/nuxtjs-seo` replaces `nuxtseo-cli`, which lives in a
 * private repository that skilld can never list.
 * `harlan-zw/gscdump` is a single-Skill repository, so its hub URL is the
 * Skill page.
 */
export const PROBE_EXCEPTIONS: readonly SkillRef[] = [
  { owner: 'harlan-zw', repo: 'nuxt-seo', name: 'nuxtjs-seo' },
  { owner: 'harlan-zw', repo: 'gscdump', name: 'gscdump' },
]

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
  firstBoard: TrendingBoardName | 'probe'
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
 * True once the admitted set holds any row. While it holds none, the rule falls
 * back to the pre-experiment decision (`seo_indexable`), because an empty set
 * would `noindex` every Skill page: a state Googlebot could fetch after a
 * deploy, an emptied table, or a task that has failed for days.
 */
export const SKILL_ADMISSIONS_POPULATED_SQL = 'EXISTS (SELECT 1 FROM skill_trending_admissions)'

const SKILL_PROBE_SQL = `EXISTS (
  SELECT 1 FROM skill_trending_admissions adm
  WHERE adm.owner = s.owner AND adm.repo = s.repo AND adm.name = s.name AND adm.first_board = 'probe'
)`

/**
 * The SQL twin of `isSkillIndexable`, minus the aggregator test: admitted, and
 * either past the quality score or a probe exception. Queries that list
 * indexable Skills use this one clause.
 */
export const SKILL_INDEXABLE_SQL = `(
  (s.seo_indexable = 1 AND NOT ${SKILL_ADMISSIONS_POPULATED_SQL})
  OR ((s.seo_indexable = 1 OR ${SKILL_PROBE_SQL}) AND ${SKILL_ADMITTED_SQL})
)`

/**
 * Columns a `skills s JOIN repos r` read adds to call `isSkillIndexable`.
 * `s.seo_indexable` is already in the shared Skill select.
 */
export const SKILL_INDEX_INPUT_COLUMNS_SQL = `${SKILL_ADMITTED_SQL} AS trending_admitted,
  ${SKILL_PROBE_SQL} AS probe_exception,
  ${SKILL_ADMISSIONS_POPULATED_SQL} AS admissions_populated,
  r.repo_kind`

export interface SkillIndexInput {
  seo_indexable: number | null
  trending_admitted: number | null
  probe_exception: number | null
  admissions_populated: number | null
  repo_kind: string | null
}

/**
 * Whether the Skill page is `index,follow`. The sitemap lists the same set.
 *
 * Aggregator repositories stay out because the sitemap has always excluded
 * them. The page now says the same.
 */
export function isSkillIndexable(input: SkillIndexInput): boolean {
  if (input.repo_kind === 'aggregator')
    return false
  // Never populated: the pre-experiment decision, not noindex for everyone.
  if (input.admissions_populated !== 1)
    return input.seo_indexable === 1
  return (input.seo_indexable === 1 || input.probe_exception === 1)
    && input.trending_admitted === 1
}

let fallbackLogged = false

/** Log once per isolate that the rule is running on its fallback. */
export function noteAdmissionFallback(): void {
  if (fallbackLogged)
    return
  fallbackLogged = true
  emitOperationalEvent(createWideEvent({
    operation: 'trending-admission',
    outcome: 'fallback-empty-set',
    reason: 'skill_trending_admissions is empty; using the pre-experiment indexability rule',
  }))
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

/** Probe exceptions that exist in the registry as resolved Skills right now. */
async function loadProbeAdmissions(db: D1Database): Promise<Admission[]> {
  const found: Admission[] = []
  for (const skill of PROBE_EXCEPTIONS) {
    const row = await db
      .prepare('SELECT 1 AS present FROM skills WHERE owner = ?1 AND repo = ?2 AND name = ?3 AND source_resolved = 1')
      .bind(skill.owner, skill.repo, skill.name)
      .first<{ present: number }>()
    if (row)
      found.push({ skill, firstBoard: 'probe' })
  }
  return found
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
  const [admitted, sightings, probes] = await Promise.all([loadAdmittedKeys(db), loadBoardSightings(db, now), loadProbeAdmissions(db)])
  // A probe wins over a board label, even for a Skill already admitted, because
  // only `probe` waives the quality score.
  const probeKeys = new Set(probes.map(probe => admissionKey(probe.skill)))
  const boards = planAdmissions(new Set([...admitted, ...probeKeys]), sightings)

  const insert = (skill: SkillRef, firstBoard: string, upsert: boolean) => db
    .prepare(`INSERT INTO skill_trending_admissions (owner, repo, name, admitted_at, first_board)
              VALUES (?1, ?2, ?3, ?4, ?5)
              ${upsert ? 'ON CONFLICT (owner, repo, name) DO UPDATE SET first_board = \'probe\'' : 'ON CONFLICT (owner, repo, name) DO NOTHING'}`)
    .bind(skill.owner, skill.repo, skill.name, now, firstBoard)
  const statements = [
    ...probes.map(probe => insert(probe.skill, 'probe', true)),
    ...boards.map(({ skill, firstBoard }) => insert(skill, firstBoard, false)),
  ]
  if (statements.length === 0)
    return []
  await db.batch(statements)
  return [...probes.filter(probe => !admitted.has(admissionKey(probe.skill))), ...boards]
}

export interface AdmittedSkillRow {
  owner: string
  repo: string
  name: string
  description: string | null
  stars: number | null
  admitted_at: number
  repo_skill_count: number
}

export const ADMITTED_PAGE_SIZE = 50

/**
 * One page of admitted Skills whose first board is `board`, newest first.
 *
 * Only Skills whose page is `index,follow` appear, so every link here points at
 * an indexable page. The trending pages render these as plain links, which is
 * how a crawler finds an admitted Skill that has left the live board.
 */
export async function listAdmittedSkills(
  db: D1Database,
  opts: { board: TrendingBoardName, page: number },
): Promise<{ rows: AdmittedSkillRow[], total: number }> {
  const filter = `a.first_board = ?1
    AND s.seo_indexable = 1
    AND s.source_resolved = 1
    AND r.repo_kind != 'aggregator'`
  const from = `FROM skill_trending_admissions a
    JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo`
  const [page, count] = await Promise.all([
    db.prepare(`
      SELECT s.owner, s.repo, s.name, s.description, r.stars, a.admitted_at,
        (SELECT COUNT(*) FROM skills c WHERE c.owner = s.owner AND c.repo = s.repo AND c.source_resolved = 1) AS repo_skill_count
      ${from}
      WHERE ${filter}
      ORDER BY a.admitted_at DESC, s.owner, s.repo, s.name
      LIMIT ?2 OFFSET ?3
    `).bind(opts.board, ADMITTED_PAGE_SIZE, (opts.page - 1) * ADMITTED_PAGE_SIZE).all<AdmittedSkillRow>(),
    db.prepare(`SELECT COUNT(*) AS total ${from} WHERE ${filter}`).bind(opts.board).first<{ total: number }>(),
  ])
  return { rows: page.results ?? [], total: count?.total ?? 0 }
}
