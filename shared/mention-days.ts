/**
 * Mentions per day for the braille spark on a trending row.
 *
 * Days are rolling 24-hour windows that end at the board's clock, so the last
 * bar is the past 24 hours. Calendar days would make the last bar a partial
 * day, and every Skill would seem to fade each morning in UTC.
 *
 * Imports nothing, so the weekly email and a script can load it too.
 */

const DAY = 86_400

/** Days in one spark, oldest first. Matches `SPARK_DAYS` in `braille-spark.ts`. */
export const MENTION_DAYS = 7

/**
 * Count timestamps into seven rolling days, oldest first, the last 24 hours last.
 *
 * A timestamp after `now` counts as the last day: a post cannot come from the
 * future, so it is clock skew between the ingest and the board. A timestamp
 * older than seven days counts nowhere.
 */
export function mentionsByDay(postedAt: readonly number[], now: number): number[] {
  const days = Array.from<number>({ length: MENTION_DAYS }).fill(0)
  for (const at of postedAt) {
    const ago = Math.max(0, Math.floor((now - at) / DAY))
    if (ago < MENTION_DAYS)
      days[MENTION_DAYS - 1 - ago]! += 1
  }
  return days
}
