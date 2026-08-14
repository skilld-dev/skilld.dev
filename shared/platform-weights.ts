/**
 * Per-platform scoring constants.
 *
 * Engagement numbers are not portable between networks, and treating them as
 * if they were is the single easiest way to make this feature wrong. Measured
 * over the same 30-day window in August 2026:
 *
 *   X        ~250 repo-bearing posts/day. A trending post clears several
 *            thousand weighted points. Bookmarks are the strongest signal and
 *            routinely run into the thousands.
 *   Bluesky  ~2 repo-bearing posts/day. The single highest-scoring post in the
 *            whole window scored 20. The median scored 0. There is no bookmark
 *            count and no impression count to read.
 *
 * So a shared threshold cannot work in either direction. X's announce floor of
 * 300 would silence Bluesky permanently; Bluesky's floor of 50 would turn the
 * Discord channel into a firehose of X noise. Both live here, side by side,
 * so the asymmetry is visible rather than buried at two call sites.
 */

import type { TrendingWeights } from './trending-score'
import { DEFAULT_TRENDING_WEIGHTS } from './trending-score'

/** The networks discovery polls. `hn` is in the ledger but is not post-scored. */
export type Platform = 'x' | 'bsky'

/**
 * Bluesky weights.
 *
 * `bookmark` is 0 because the metric does not exist, not because bookmarks
 * stopped mattering. Nothing on this platform can ever populate that field, so
 * a non-zero weight would be dead configuration that reads as a tuning choice.
 *
 * The remaining weights deliberately keep the score close to raw counts. The
 * thresholds below are calibrated in units a person can eyeball against a
 * post's like count, and inflating the weights would break that intuition
 * without adding any information.
 *
 * `halfLifeHours` is longer than X's. Bluesky posts accrue engagement slowly
 * and from a smaller pool; a 24-hour half-life scored almost everything to
 * zero before its second metrics snapshot ever landed.
 */
export const BSKY_TRENDING_WEIGHTS: TrendingWeights = {
  favourite: 1,
  repost: 3,
  reply: 2,
  quote: 4,
  bookmark: 0,
  halfLifeHours: 72,
  coldStartFactor: 0.35,
  velocityWeight: 1,
  maxAgeHours: 24 * 30,
}

export const TRENDING_WEIGHTS_BY_PLATFORM: Record<Platform, TrendingWeights> = {
  x: DEFAULT_TRENDING_WEIGHTS,
  bsky: BSKY_TRENDING_WEIGHTS,
}

/**
 * Evidence score a repo must reach before it earns a Discord message.
 *
 * X's 300 is roughly "a post with a few hundred favourites, or a smaller one
 * carrying real bookmark intent".
 *
 * Bluesky's 50 is calibrated from the observed distribution rather than
 * scaled from X: on this network 30 is a notably well-received post and 50 is
 * a high one. Set it much lower and every second post announces; scale X's
 * number down proportionally and nothing ever would.
 */
export const ANNOUNCE_MIN_EVIDENCE_BY_SOURCE = {
  x: 300,
  bsky: 50,
  // Hacker News scores in points, on its own scale again. Front page is ~100.
  hn: 100,
} as const satisfies Record<string, number>
