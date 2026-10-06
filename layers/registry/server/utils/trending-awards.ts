/**
 * Trending awards (ADR-0011). The rule and the labels live in
 * `#shared/trending-award`. This file reads the boards and writes the table.
 *
 * Separate from `trending-admission.ts` on purpose. Admission is an SEO
 * experiment with its own gate and cull path, and ending it must not end the
 * awards. Both read the same board loader, so they agree on what trended.
 */

import type { TrendingAward, TrendingAwardBoard } from '#shared/trending-award'
import type { SkillRef } from './trending-admission'
import { loadTrendingBoard } from '#shared/server/trending-board'
import { compareTrendingAwards, TRENDING_AWARD_BOARDS, trendingAwardPeriod } from '#shared/trending-award'
import { TRENDING_BOARD_LIMIT, trendingRangeMeta } from '#shared/trending-range'
import { admissionKey } from './trending-admission'

export interface AwardSighting {
  board: TrendingAwardBoard
  rank: number
  skill: SkillRef
}

export interface AwardWrite extends TrendingAward {
  skill: SkillRef
}

function awardKey(skill: SkillRef, board: TrendingAwardBoard, period: string): string {
  return `${admissionKey(skill)}/${board}/${period}`
}

/**
 * Every evidenced row on the `week` and `month` boards, with its rank.
 *
 * Rank is the row's position on the board a reader sees. Named Skills come
 * first there, so their index is their rank. Star filler sits below them and
 * earns nothing; neither does a named row with no post and no surge.
 */
export async function loadAwardSightings(db: D1Database, now: number): Promise<AwardSighting[]> {
  const sightings: AwardSighting[] = []
  for (const board of TRENDING_AWARD_BOARDS) {
    const windowHours = trendingRangeMeta(board).windowHours
    if (windowHours === null)
      continue
    const { namedSkills } = await loadTrendingBoard({ db, now, limit: TRENDING_BOARD_LIMIT, windowHours })
    namedSkills.forEach((entry, index) => {
      const evidenced = entry.evidence !== null || (entry.github?.latestGain ?? null) !== null
      if (evidenced)
        sightings.push({ board, rank: index + 1, skill: { owner: entry.owner, repo: entry.repo, name: entry.slug } })
    })
  }
  return sightings
}

/**
 * The awards a run must write, given what it saw and what is already held.
 *
 * Pure. A write happens only for a new award or a better rank in the same
 * period, so a replay or a quiet hour writes nothing, and a rank never worsens.
 */
export function planAwardWrites(
  held: ReadonlyMap<string, number>,
  sightings: readonly AwardSighting[],
  now: number,
): AwardWrite[] {
  const planned = new Map<string, AwardWrite>()
  for (const { board, rank, skill } of sightings) {
    const period = trendingAwardPeriod(board, now)
    const key = awardKey(skill, board, period)
    const best = Math.min(held.get(key) ?? Infinity, planned.get(key)?.rank ?? Infinity)
    if (rank < best)
      planned.set(key, { skill, board, period, rank })
  }
  return [...planned.values()]
}

async function loadHeldRanks(db: D1Database, now: number): Promise<Map<string, number>> {
  const periods = TRENDING_AWARD_BOARDS.map(board => trendingAwardPeriod(board, now))
  const rows = (await db
    .prepare(`SELECT owner, repo, name, board, period, best_rank FROM skill_trending_awards WHERE period IN (?1, ?2)`)
    .bind(periods[0], periods[1])
    .all<SkillRef & { board: TrendingAwardBoard, period: string, best_rank: number }>()).results ?? []
  return new Map(rows.map(row => [awardKey(row, row.board, row.period), row.best_rank]))
}

/** Record this hour's board placements. Returns the awards it wrote. */
export async function recordTrendingAwards(db: D1Database, now: number): Promise<AwardWrite[]> {
  const [held, sightings] = await Promise.all([loadHeldRanks(db, now), loadAwardSightings(db, now)])
  const writes = planAwardWrites(held, sightings, now)
  if (writes.length === 0)
    return []
  await db.batch(writes.map(({ skill, board, period, rank }) => db
    .prepare(`INSERT INTO skill_trending_awards (owner, repo, name, board, period, best_rank, ranked_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
              ON CONFLICT (owner, repo, name, board, period) DO UPDATE
                SET best_rank = excluded.best_rank, ranked_at = excluded.ranked_at
                WHERE excluded.best_rank < skill_trending_awards.best_rank`)
    .bind(skill.owner, skill.repo, skill.name, board, period, rank, now)))
  return writes
}

/**
 * A `skills s` row's awards as one JSON column, `trending_awards`.
 *
 * A column on the Skill read rather than its own query: an uncached Skill
 * page has a fixed D1 read budget (`skill-detail-d1-cost.test.ts`).
 */
export const SKILL_TRENDING_AWARDS_SQL = `(SELECT json_group_array(json_object('board', a.board, 'period', a.period, 'rank', a.best_rank))
    FROM skill_trending_awards a
    WHERE a.owner = s.owner AND a.repo = s.repo AND a.name = s.name) AS trending_awards`

function isTrendingAward(value: unknown): value is TrendingAward {
  if (!value || typeof value !== 'object')
    return false
  const { board, period, rank } = value as Record<string, unknown>
  return (board === 'week' || board === 'month')
    && typeof period === 'string'
    && typeof rank === 'number' && Number.isInteger(rank) && rank >= 1
}

/** Parse the `trending_awards` column. Best award first. */
export function parseSkillTrendingAwards(json: string | null): TrendingAward[] {
  if (!json)
    return []
  const rows = JSON.parse(json) as unknown
  return Array.isArray(rows) ? rows.filter(isTrendingAward).sort(compareTrendingAwards) : []
}
