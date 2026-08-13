/**
 * Detect unusual jumps in a tracked repo's star count.
 *
 * Star growth is the second trend signal, independent of X. A repo can climb
 * hard on GitHub with nobody posting about it, and that is worth surfacing on
 * the same page: it is the same question ("what is moving right now") asked of
 * a source we already record.
 *
 * Pure and clock-injected, like the rest of the ranking code. Input is the
 * daily observation series `repo_star_observations` already collects during
 * metadata sync, so detection adds no API calls and no new tracking.
 *
 * WHY A MEDIAN BASELINE. A repo's normal growth is not its average growth. One
 * prior spike drags a mean upward for weeks, which is exactly the window where
 * it would mask the next spike. The median daily gain ignores its own outliers,
 * so a repo that spiked last Tuesday can still be caught spiking today.
 *
 * WHY TWO CONDITIONS. A ratio alone fires constantly on quiet repos, where
 * going from 0 to 3 stars a day is an infinite multiple of nothing. An absolute
 * floor alone fires constantly on large repos, where 40 stars a day is Tuesday.
 * A surge has to clear both: unusual for this repo, and large enough to mean
 * something in absolute terms.
 */

export interface StarObservationPoint {
  /** Unix seconds, floored to a UTC day boundary. */
  observedDay: number
  stars: number
}

export interface StarSurgeConfig {
  /** Days of history compared against, not counting the day being judged. */
  baselineDays: number
  /** Minimum observations required before any judgement is made. */
  minObservations: number
  /** Stars gained in the latest interval, below which nothing is a surge. */
  minAbsoluteGain: number
  /** Multiple of the median daily gain that counts as unusual. */
  surgeMultiplier: number
  /**
   * Gain that is a surge on its own, whatever the repo's baseline. Without
   * this, a repo that normally gains 200/day could quadruple to 800/day and
   * still be judged normal if its median happened to be high.
   */
  alwaysSurgeGain: number
}

export const DEFAULT_STAR_SURGE_CONFIG: StarSurgeConfig = {
  baselineDays: 14,
  minObservations: 3,
  minAbsoluteGain: 15,
  surgeMultiplier: 4,
  alwaysSurgeGain: 250,
}

export type StarSurgeVerdict
  = | { _tag: 'insufficient-history', observations: number }
    | { _tag: 'steady', latestGain: number, baselineGain: number }
    | {
      _tag: 'surge'
      latestGain: number
      baselineGain: number
      /** How many times the usual daily gain this is; Infinity from a standstill. */
      multiple: number
      observedDay: number
      stars: number
    }

function median(values: number[]): number {
  if (values.length === 0)
    return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

/**
 * Per-day gains between consecutive observations.
 *
 * Divided by the day gap rather than assumed to be one day apart: a missed
 * sync leaves a two-day hole, and treating that hole as a single day would
 * report double the real growth rate and fire a false surge.
 */
function dailyGains(series: StarObservationPoint[]): number[] {
  const gains: number[] = []
  for (let i = 1; i < series.length; i++) {
    const previous = series[i - 1]!
    const current = series[i]!
    const days = Math.max(1, Math.round((current.observedDay - previous.observedDay) / 86_400))
    // Star counts can fall when accounts are deleted. A negative gain is noise,
    // not a signal, and would drag the median below the true quiet level.
    gains.push(Math.max(0, (current.stars - previous.stars) / days))
  }
  return gains
}

export function detectStarSurge(
  observations: StarObservationPoint[],
  config: StarSurgeConfig = DEFAULT_STAR_SURGE_CONFIG,
): StarSurgeVerdict {
  if (observations.length < config.minObservations)
    return { _tag: 'insufficient-history', observations: observations.length }

  const series = [...observations].sort((a, b) => a.observedDay - b.observedDay)
  const gains = dailyGains(series)
  const latestGain = gains.at(-1) ?? 0
  const baselineGain = median(gains.slice(-1 - config.baselineDays, -1))

  const latest = series.at(-1)!
  const unusual = latestGain >= baselineGain * config.surgeMultiplier
  const large = latestGain >= config.minAbsoluteGain

  if ((unusual && large) || latestGain >= config.alwaysSurgeGain) {
    return {
      _tag: 'surge',
      latestGain,
      baselineGain,
      multiple: baselineGain > 0 ? latestGain / baselineGain : Number.POSITIVE_INFINITY,
      observedDay: latest.observedDay,
      stars: latest.stars,
    }
  }

  return { _tag: 'steady', latestGain, baselineGain }
}

/**
 * Human-readable summary for a notification or an admin row.
 *
 * A repo climbing from a standstill has an infinite multiple, which is true and
 * useless to print, so it is described in words instead of as a number.
 */
export function describeStarSurge(
  repo: { owner: string, repo: string },
  surge: Extract<StarSurgeVerdict, { _tag: 'surge' }>,
): string {
  const gain = Math.round(surge.latestGain)
  const pace = Number.isFinite(surge.multiple)
    ? `${surge.multiple.toFixed(1)}x its usual pace`
    : 'up from a standstill'
  return `${repo.owner}/${repo.repo} gained ${gain} stars in a day, ${pace}`
}
