/**
 * Trending feed: repos the ecosystem is posting about on X right now.
 *
 * `indexedOnly` is not optional here. A repo discovered from a post but not
 * yet resolved to a skill has nothing to show and no reason to be crawled;
 * shipping those would recreate the thin-page problem that suppressed the
 * catalog. The admin review surface reads the same loader without the filter.
 */

import type { FallbackSkill } from '#shared/server/trending-fallback'
import type { TrendingRepo } from '#shared/server/trending-repos'
import type { TrendingSkill } from '#shared/server/trending-skills'
import { getDB } from '#server/utils/db'
import { loadTrendingBoard } from '#shared/server/trending-board'
import { DEFAULT_WINDOW_HOURS } from '#shared/server/trending-skills'

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
  skills: Array<{
    name: string
    displayName: string
    slug: string
    description: string | null
    registryPath: string
  }>
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
  name: string
  canonicalName: string
  /** Final public route. Clients must use this value directly. */
  registryPath: string
  description: string | null
  stars: number
  starsGained: number | null
}

/**
 * An individual skill this page can name accurately, by either route.
 *
 * Two routes qualify and they are different assertions. `social` means a person
 * named the skill in a post, matched against the vocabulary its own repository
 * ships. `github` means the repository's stars surged AND it holds exactly one
 * skill, so the surge cannot belong to anything else.
 *
 * `attribution` therefore has to travel with every entry rather than being
 * stated once over a list. An earlier version grouped these under a heading
 * reading "Named by developers", which was false for every star-attributed row
 * on the page: production served four such rows with `authorCount: 0` and no
 * evidence, under copy claiming people had named them.
 */
export interface TrendingSkillFeedItem {
  owner: string
  repo: string
  name: string
  canonicalName: string
  /** Final public route. Clients must use this value directly. */
  registryPath: string
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
  /** Current stars on the skill's repository. Authority context, never ranked. */
  stars: number | null
  /**
   * What the skill does, in its author's words.
   *
   * The post that named it proves the mention; this explains the thing. A row
   * showing only the post reads as a quote with no subject.
   */
  description: string | null
  /** Stars gained on the surge day, present only on the GitHub route. */
  starGain: number | null
  /**
   * UTC midnight of the surge day, present only on the GitHub route.
   *
   * Carried so a star-attributed row can date itself. Without it those rows
   * are the only entries on a page titled "this week" that state no time at
   * all, which reads as missing data rather than as a different kind of claim.
   */
  starGainDay: number | null
  evidence: {
    url: string
    authorHandle: string
    /** Author profile image, stored at ingest. Null before the first read that carried one. */
    authorAvatar: string | null
    text: string
    postedAt: number
    platform: 'x' | 'bsky'
    /**
     * Engagement on this specific post, not the skill's aggregate.
     *
     * A reader weighing a quote wants to know whether it landed. The
     * skill-level `favouriteCount` sums every qualifying post and cannot
     * answer that for the one being shown.
     */
    favouriteCount: number
  } | null
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
    name: entry.slug,
    canonicalName: entry.canonicalName,
    registryPath: entry.registryPath,
    attribution: entry.attribution,
    authorCount: entry.social?.authorCount ?? 0,
    mentionCount: entry.social?.mentionCount ?? 0,
    favouriteCount: entry.social?.engagement ?? 0,
    stars: entry.stars,
    description: entry.description,
    starGain: entry.github?.latestGain ?? null,
    starGainDay: entry.github?.observedDay ?? null,
    evidence: entry.evidence
      ? {
          url: entry.evidence.url,
          authorHandle: entry.evidence.authorHandle,
          authorAvatar: entry.evidence.authorAvatar,
          text: entry.evidence.text,
          postedAt: entry.evidence.postedAt,
          platform: entry.evidence.platform,
          favouriteCount: entry.evidence.favouriteCount,
        }
      : null,
  }
}

function toFallbackItem(entry: FallbackSkill): FallbackFeedItem {
  return {
    owner: entry.owner,
    repo: entry.repo,
    name: entry.slug,
    canonicalName: entry.canonicalName,
    registryPath: entry.registryPath,
    description: entry.description,
    stars: entry.stars,
    starsGained: entry.starsGained,
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
      registryPath: s.registryPath,
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

    const { entries, namedSkills, fallback: fallbackSkills } = await loadTrendingBoard({ db, now, limit, windowHours })

    const items = entries.map(toItem)
    const skillItems = namedSkills.map(toSkillItem)
    const fallback = fallbackSkills.map(toFallbackItem)

    return { items, namedSkills: skillItems, fallback, computedAt: now }
  },
  // Engagement is re-read hourly at most, so a shorter cache would spend D1
  // reads to serve a ranking that cannot have changed.
  { maxAge: 300, swr: false, name: 'feed-trending-origin-v3' },
)
