/**
 * Trending awards (ADR-0011): the best rank a Skill reached on one trending
 * board in one period, kept after the Skill leaves the board.
 *
 * The award repeats a claim the board already made in public, so it inherits
 * the board's evidence rule. Only a row with a post or a star surge behind it
 * earns one. Star filler never does, and the `all` range awards nothing,
 * because it ranks by lifetime stars rather than by anyone talking.
 *
 * Pure, so the Skill page, the README badge, and the recording task share one
 * reading of a period and one label.
 */

import { formatBoardDay } from './trending-range'

export type TrendingAwardBoard = 'week' | 'month'

export const TRENDING_AWARD_BOARDS: readonly TrendingAwardBoard[] = ['week', 'month']

export interface TrendingAward {
  board: TrendingAwardBoard
  /** `YYYY-MM-DD` for the Monday (UTC) that starts a week, `YYYY-MM` for a month. */
  period: string
  /** Best rank in the period. 1 is the first row on the board. */
  rank: number
}

const DAY_SECONDS = 86_400

/**
 * The period a board sighting at `nowSeconds` counts toward.
 *
 * Calendar periods in UTC, not the board's rolling window. A rolling window
 * has no name a reader can check, and an award needs one.
 */
export function trendingAwardPeriod(board: TrendingAwardBoard, nowSeconds: number): string {
  const date = new Date(nowSeconds * 1000)
  if (board === 'month')
    return date.toISOString().slice(0, 7)
  // getUTCDay: Sunday is 0. ISO weeks start on Monday.
  const sinceMonday = (date.getUTCDay() + 6) % 7
  const midnight = Math.floor(nowSeconds / DAY_SECONDS) * DAY_SECONDS
  return new Date((midnight - sinceMonday * DAY_SECONDS) * 1000).toISOString().slice(0, 10)
}

/** `week of 29 Sep 2026` or `September 2026`. */
export function trendingAwardPeriodLabel(award: Pick<TrendingAward, 'board' | 'period'>): string {
  if (award.board === 'week') {
    const day = formatBoardDay(Date.parse(`${award.period}T00:00:00Z`) / 1000)
    return `week of ${day}`
  }
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(Date.parse(`${award.period}-01T00:00:00Z`))
}

/**
 * The chip and README badge text: `#3 trending · Sep 2026`.
 *
 * Always dated. A badge outlives the board, and an undated rank reads as
 * current months later. The month of a week award is the month it started in.
 */
export function trendingAwardBadgeLabel(award: TrendingAward): string {
  const month = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(Date.parse(`${award.period.slice(0, 7)}-01T00:00:00Z`))
  return `#${award.rank} trending · ${month}`
}

/** The full claim: `#3 trending, week of 29 Sep 2026`. */
export function trendingAwardLabel(award: TrendingAward): string {
  return `#${award.rank} trending, ${trendingAwardPeriodLabel(award)}`
}

/** The board range that awarded it. */
export function trendingAwardPath(award: Pick<TrendingAward, 'board'>): string {
  return award.board === 'week' ? '/skills/trending?range=week' : '/skills/trending'
}

/**
 * The one award a Skill leads with: best rank first, then the month board,
 * which takes thirty days of attention to top, then the newest period.
 */
export function headlineTrendingAward(awards: readonly TrendingAward[]): TrendingAward | null {
  let best: TrendingAward | null = null
  for (const award of awards) {
    if (!best || compareTrendingAwards(award, best) < 0)
      best = award
  }
  return best
}

/** Sort order for a list of awards. The headline award sorts first. */
export function compareTrendingAwards(left: TrendingAward, right: TrendingAward): number {
  if (left.rank !== right.rank)
    return left.rank - right.rank
  if (left.board !== right.board)
    return left.board === 'month' ? -1 : 1
  return right.period.localeCompare(left.period)
}
