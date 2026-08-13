/**
 * Trending feed: repos the ecosystem is posting about on X right now.
 *
 * `indexedOnly` is not optional here. A repo discovered from a post but not
 * yet resolved to a skill has nothing to show and no reason to be crawled;
 * shipping those would recreate the thin-page problem that suppressed the
 * catalog. The admin review surface reads the same loader without the filter.
 */

import type { TrendingRepo } from '#shared/server/trending-repos'
import { getDB } from '#server/utils/db'
import { loadSurgingRepos } from '#shared/server/star-surge-scan'
import { loadTrendingRepos } from '#shared/server/trending-repos'

export interface TrendingFeedItem {
  owner: string
  repo: string
  description: string | null
  stars: number | null
  /** Distinct people who posted about it, the honest measure of a trend. */
  authorCount: number
  postCount: number
  favouriteCount: number
  bookmarkCount: number
  latestPostedAt: number
  skills: Array<{ name: string, displayName: string, slug: string, description: string | null }>
  skillCount: number
  evidence: {
    url: string
    authorHandle: string
    authorName: string | null
    text: string
    postedAt: number
  } | null
}

/**
 * A repo climbing on GitHub, which is a separate signal from X chatter: a repo
 * can gain stars fast with nobody posting about it. Kept as its own list
 * rather than blended into the ranking, because the two measure different
 * things and a combined score would hide which one fired.
 */
export interface SurgingFeedItem {
  owner: string
  repo: string
  starsGained: number
  stars: number
}

export interface TrendingFeedResponse {
  items: TrendingFeedItem[]
  surging: SurgingFeedItem[]
  /** Unix seconds the ranking was computed at, for a "as of" line in the UI. */
  computedAt: number
}

function toItem(entry: TrendingRepo): TrendingFeedItem {
  return {
    owner: entry.owner,
    repo: entry.repo,
    description: entry.repoDescription,
    stars: entry.stars,
    authorCount: entry.authorCount,
    postCount: entry.postCount,
    favouriteCount: entry.totals.favouriteCount,
    bookmarkCount: entry.totals.bookmarkCount,
    latestPostedAt: entry.latestPostedAt,
    skills: entry.skills.slice(0, 4).map(s => ({
      name: s.name,
      displayName: s.displayName ?? s.name,
      slug: s.slug,
      description: s.description,
    })),
    skillCount: entry.skills.length,
    evidence: entry.evidence
      ? {
          url: entry.evidence.url,
          authorHandle: entry.evidence.authorHandle,
          authorName: entry.evidence.authorName,
          text: entry.evidence.text,
          postedAt: entry.evidence.postedAt,
        }
      : null,
  }
}

export default defineCachedEventHandler(
  async (event): Promise<TrendingFeedResponse> => {
    const db = getDB(event)
    const now = Math.floor(Date.now() / 1000)
    const limit = Math.min(Number(getQuery(event).limit) || 24, 50)

    const [entries, surging] = await Promise.all([
      loadTrendingRepos({ db, now, limit, indexedOnly: true }),
      loadSurgingRepos({ db, now, limit: 6, indexedOnly: true }),
    ])

    return {
      items: entries.map(toItem),
      surging: surging.map(s => ({
        owner: s.owner,
        repo: s.repo,
        starsGained: s.latestGain,
        stars: s.stars,
      })),
      computedAt: now,
    }
  },
  // Engagement is re-read hourly at most, so a shorter cache would spend D1
  // reads to serve a ranking that cannot have changed.
  { maxAge: 300, swr: false, name: 'feed-trending-origin-v1' },
)
