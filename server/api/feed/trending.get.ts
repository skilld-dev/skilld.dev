/**
 * Trending feed: repos the ecosystem is posting about on X right now.
 *
 * `indexedOnly` is not optional here. A repo discovered from a post but not
 * yet resolved to a skill has nothing to show and no reason to be crawled;
 * shipping those would recreate the thin-page problem that suppressed the
 * catalog. The admin review surface reads the same loader without the filter.
 */

import type { TrendingRepo } from '#shared/server/trending-repos'
import type { TrendingSkill } from '#shared/server/trending-skills'
import { getDB } from '#server/utils/db'
import { loadFallbackSkills } from '#shared/server/trending-fallback'
import {
  DEFAULT_MAX_REPOS_PER_POST,
  DEFAULT_MIN_LIKES,
  loadTrendingRepos,
} from '#shared/server/trending-repos'
import { DEFAULT_WINDOW_HOURS, loadTrendingSkills } from '#shared/server/trending-skills'

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
 * A popular repo shown because X was quiet, not because anyone posted about it.
 * Kept in its own list so the page can label it honestly rather than passing
 * star count off as conversation.
 */
export interface FallbackFeedItem {
  owner: string
  repo: string
  slug: string
  canonicalName: string
  description: string | null
  stars: number
  repoSkillCount: number
  starsGained: number | null
}

/**
 * An individual skill somebody named, verified against a SKILL.md in a repo the
 * post linked. Separate from `items` because it is a different, much stronger
 * claim: not "people are posting about this repo" but "someone named this
 * skill by name". It is also far rarer, so blending the two would bury it.
 */
export interface TrendingSkillFeedItem {
  owner: string
  repo: string
  slug: string
  canonicalName: string
  /**
   * How the skill was named. `social` means a person named it in a post;
   * `github` means its repository surged AND holds exactly one skill, so the
   * surge cannot belong to anything else; `both` is the strongest claim.
   *
   * The UI must say which, because the two are different assertions and a
   * reader deserves to know whether a person or a star count made the claim.
   */
  attribution: 'social' | 'github' | 'both'
  /** Separate accounts that named it. Zero for a star-only skill. */
  authorCount: number
  mentionCount: number
  favouriteCount: number
  /** Stars gained on the surge day, present only on the GitHub route. */
  starGain: number | null
  evidence: { url: string, authorHandle: string, text: string, postedAt: number, platform: 'x' | 'bsky' } | null
}

export interface TrendingFeedResponse {
  items: TrendingFeedItem[]
  /** Skills named outright, highest-precision signal we have. */
  namedSkills: TrendingSkillFeedItem[]
  /** Star-ranked filler, only present when `items` came up short. */
  fallback: FallbackFeedItem[]
  /** Unix seconds the ranking was computed at, for a "as of" line in the UI. */
  computedAt: number
}

function toSkillItem(entry: TrendingSkill): TrendingSkillFeedItem {
  return {
    owner: entry.owner,
    repo: entry.repo,
    slug: entry.slug,
    canonicalName: entry.canonicalName,
    attribution: entry.attribution,
    authorCount: entry.social?.authorCount ?? 0,
    mentionCount: entry.social?.mentionCount ?? 0,
    favouriteCount: entry.social?.engagement ?? 0,
    starGain: entry.github?.latestGain ?? null,
    evidence: entry.evidence
      ? {
          url: entry.evidence.url,
          authorHandle: entry.evidence.authorHandle,
          text: entry.evidence.text,
          postedAt: entry.evidence.postedAt,
          platform: entry.evidence.platform,
        }
      : null,
  }
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

    // Star growth is no longer part of trending. It measures a repo, not the
    // conversation, and mixing the two hid which signal had actually fired.
    // The detect-star-surges task keeps collecting for a future surface.
    // `window` accepts hours so a caller can ask for today (24) rather than
    // the default week. Clamped to a month: beyond that nothing is trending.
    const windowHours = Math.min(
      Math.max(Number(getQuery(event).window) || DEFAULT_WINDOW_HOURS, 1),
      24 * 30,
    )

    const [entries, namedSkills] = await Promise.all([
      loadTrendingRepos({
        db,
        now,
        limit,
        indexedOnly: true,
        minLikes: DEFAULT_MIN_LIKES,
        maxReposPerPost: DEFAULT_MAX_REPOS_PER_POST,
      }),
      loadTrendingSkills({ db, now, windowHours, limit: 12 }),
    ])

    // Top up from GitHub stars when X has been quiet. Below this many entries
    // the page reads as broken, and at fewer than eight it excludes itself
    // from the index, so filler is better than an empty shelf.
    const MIN_BEFORE_FALLBACK = 8
    const items = entries.map(toItem)
    const fallback = items.length >= MIN_BEFORE_FALLBACK
      ? []
      : await loadFallbackSkills({
          db,
          now,
          limit: MIN_BEFORE_FALLBACK - items.length,
          exclude: new Set(items.map(i => `${i.owner}/${i.repo}`)),
        })

    return { items, namedSkills: namedSkills.map(toSkillItem), fallback, computedAt: now }
  },
  // Engagement is re-read hourly at most, so a shorter cache would spend D1
  // reads to serve a ranking that cannot have changed.
  { maxAge: 300, swr: false, name: 'feed-trending-origin-v1' },
)
