/**
 * Seven days of counts as seven braille bars.
 *
 * The spark is plain text, so the same string works on the site, in the
 * weekly email, in Discord, and in a terminal. This module imports nothing,
 * so an email renderer or a script can load it without the app.
 *
 * Each bar is one braille cell that fills from the bottom: `⣀⣤⣶⣿`. A day with
 * no count is the blank braille cell U+2800, which keeps the column width of
 * the other bars where a space would collapse.
 */

/** The number of days in one spark. */
export const SPARK_DAYS = 7

/** Bar glyphs by level. Level 0 is the blank braille cell. */
export const SPARK_BARS = ['⠀', '⣀', '⣤', '⣶', '⣿'] as const

const TOP_LEVEL = SPARK_BARS.length - 1

/**
 * Exactly seven whole counts, oldest first, today last.
 *
 * Shorter input pads the older days with zero. Longer input keeps the newest
 * seven. A negative, fractional, or non-finite count becomes a whole count of
 * zero or more, because a count of mentions cannot be anything else.
 */
export function sparkWeek(counts: readonly number[]): number[] {
  const whole = counts.slice(-SPARK_DAYS).map(count => Number.isFinite(count) && count > 0 ? Math.floor(count) : 0)
  return [...Array.from<number>({ length: SPARK_DAYS - whole.length }).fill(0), ...whole]
}

/**
 * The bar level for each day, from 0 (blank) to 4 (full).
 *
 * Levels scale to the busiest day of the same week, so a spark shows the shape
 * of one week and never compares two Skills. Any day with a count gets at
 * least level 1, so a quiet day never reads as a silent one.
 */
export function sparkLevels(counts: readonly number[]): number[] {
  const week = sparkWeek(counts)
  const max = Math.max(...week)
  return week.map(count => count === 0 ? 0 : Math.max(1, Math.round(count / max * TOP_LEVEL)))
}

/** The seven bars as one string of seven characters, oldest first. */
export function brailleSpark(counts: readonly number[]): string {
  return sparkLevels(counts).map(level => SPARK_BARS[level]).join('')
}
