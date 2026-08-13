/**
 * Decides how often we pay to re-read a post's engagement.
 *
 * This is the only place in the feature where refresh spend is decided, so it
 * is a pure function with every constant named and no I/O of any kind.
 *
 * BILLING MODEL. Pay-per-use charges $0.005 per post read, but deduplicates:
 * reading the same post again within the same UTC day is free. That single
 * rule drives the whole policy, and it inverts the obvious intuition:
 *
 *   - Refresh *interval* is free. Re-reading a post every 10 minutes for a
 *     day costs exactly the same as reading it once: one charge.
 *   - Refresh *duration* is the bill. Every UTC day a post stays refreshable
 *     is one more charge for that post.
 *
 * So the policy keeps a short, dense window rather than a long, sparse one:
 * refresh often enough to resolve a spike, then stop before the next midnight
 * turns the post into a recurring line item. Two tiers.
 *
 *   hot     Inside the window. Refreshed on a short interval, which is free,
 *           and is where velocity for the trending page comes from.
 *   frozen  Past the window. Never read again. A frozen post keeps its final
 *           counts for display; it just stops costing anything.
 *
 * There was a `warm` tier that refreshed 6-hourly for seven days to catch a
 * post that caught fire late. Under dedup it was ~60% of the entire bill for
 * a signal that almost never changed the ranking, so it is gone. The DB CHECK
 * on `x_posts.refresh_tier` still permits 'warm'; nothing writes it.
 */

export interface RefreshPolicyConfig {
  /**
   * How long a post stays refreshable. This is the cost dial: a post costs
   * roughly one charge per UTC day it spends hot, so 12 hours averages ~1.5
   * charges per post and 24 hours averages ~2.
   */
  hotWindowHours: number
  /**
   * Seconds between refreshes while hot. Free under dedup, so this is tuned
   * for signal quality, not spend: short enough to resolve a spike.
   */
  hotIntervalSeconds: number
  /** Past this age, a post is frozen whatever it is doing. */
  freezeAfterHours: number
}

export const DEFAULT_REFRESH_POLICY: RefreshPolicyConfig = {
  hotWindowHours: 12,
  hotIntervalSeconds: 10 * 60,
  freezeAfterHours: 12,
}

export type RefreshTier = 'hot' | 'warm' | 'frozen'

export interface RefreshPlanInput {
  postedAt: number
}

export interface RefreshPlan {
  tier: RefreshTier
  /** Unix seconds. Meaningless for a frozen post; set far out as a backstop. */
  nextRefreshAt: number
}

/** A frozen post is never claimed, but a sentinel beats a null column. */
const FROZEN_SENTINEL_SECONDS = 365 * 24 * 60 * 60

export function planRefresh(
  input: RefreshPlanInput,
  now: number,
  config: RefreshPolicyConfig = DEFAULT_REFRESH_POLICY,
): RefreshPlan {
  const ageHours = (now - input.postedAt) / 3600

  // Age is the only input. Engagement used to gate the warm tier, but with
  // warm gone there is nothing left for it to decide: inside the window every
  // post is refreshed (a post two minutes old has zero engagement for reasons
  // unrelated to its quality), and outside it every post is frozen.
  if (ageHours >= config.freezeAfterHours || ageHours >= config.hotWindowHours)
    return { tier: 'frozen', nextRefreshAt: now + FROZEN_SENTINEL_SECONDS }

  return { tier: 'hot', nextRefreshAt: now + config.hotIntervalSeconds }
}

/** USD per charged post read on the pay-per-use plan. */
export const USD_PER_POST_READ = 0.005

/**
 * Charged reads per day by the refresh task.
 *
 * Counts distinct posts, NOT requests. Re-reading a post within a UTC day is
 * free, so a hot post costs one charge per day it stays hot however often it
 * is refreshed. The previous version of this multiplied by refresh frequency
 * and overstated the bill by roughly 12x, which is what made the warm tier
 * look affordable.
 *
 * Discovery pays a post's first read, so refresh is only charged when a hot
 * window crosses midnight UTC. For a window of H hours and uniformly timed
 * posts that happens to a fraction H/24 of them, and never for H >= 24 where
 * every post spans a boundary.
 */
export function estimateDailyRefreshReads(
  tierCounts: { hot: number },
  config: RefreshPolicyConfig = DEFAULT_REFRESH_POLICY,
): number {
  return Math.round(tierCounts.hot * Math.min(config.hotWindowHours / 24, 1))
}

/** Monthly USD for a given number of charged reads per day. */
export function estimateMonthlyCostUsd(readsPerDay: number): number {
  return Math.round(readsPerDay * 30 * USD_PER_POST_READ * 100) / 100
}
