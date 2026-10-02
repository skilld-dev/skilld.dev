import type { OperationResult, trendingSignalSchema, trendingV1 } from 'skilld-sdk/contract'
import type { z } from 'zod'
import type { SkillCardSource } from '#shared/server/skill-cards'
import { epochSecondsToIso, isAnswerableSkillSummary, presentCount, presentSkillSummary } from '#shared/server/skill-cards'
import { TRENDING_BOARD_LIMIT } from '#shared/trending-range'

type TrendingSignal = z.input<typeof trendingSignalSchema.producer>

/** The fields of one post in the `/api/feed/trending` answer that `trending.list` reads. */
export interface LegacyTrendingPost {
  url: string
  authorHandle: string
  authorName: string | null
  text: string
  /** Epoch seconds. */
  postedAt: number
  platform: 'x' | 'bsky'
}

/** The fields of the `/api/feed/trending` answer that `trending.list` reads. */
export interface LegacyTrendingFeed {
  namedSkills: {
    owner: string
    repo: string
    name: string
    registryPath: string
    authorCount: number
    mentionCount: number
    starGain: number | null
    /** Epoch seconds, UTC midnight of the surge day. */
    starGainDay: number | null
    evidence: LegacyTrendingPost | null
  }[]
  fallback: {
    owner: string
    repo: string
    name: string
    registryPath: string
  }[]
}

export interface TrendingBoardRow {
  skill: { owner: string, repo: string, name: string }
  signal: TrendingSignal
}

function presentPost(post: LegacyTrendingPost) {
  return {
    url: post.url,
    platform: post.platform,
    authorHandle: post.authorHandle,
    authorName: post.authorName,
    text: post.text,
    postedAt: new Date(post.postedAt * 1000).toISOString(),
  }
}

/**
 * The reason a ranked Skill is on the board, or null when the feed carries
 * none it can show. ADR-0004 lets a row claim a post only when it ships the
 * post, so a row with neither a post nor a dated surge leaves the board.
 */
function signalOf(entry: LegacyTrendingFeed['namedSkills'][number]): TrendingSignal | null {
  const social = entry.evidence
    ? { authorCount: presentCount(entry.authorCount), mentionCount: presentCount(entry.mentionCount), post: presentPost(entry.evidence) }
    : null
  const surgedOn = epochSecondsToIso(entry.starGainDay)
  const surge = entry.starGain !== null && surgedOn
    ? { starGain: presentCount(Math.round(entry.starGain)), surgedOn }
    : null
  if (social && surge)
    return { kind: 'social-and-star-surge', ...social, ...surge }
  if (social)
    return { kind: 'social', ...social }
  if (surge)
    return { kind: 'star-surge', ...surge }
  return null
}

/**
 * The board rows in rank order, composed the way /skills/trending composes
 * them: every row with a post or a surge first, then the star filler that
 * tops up a quiet week, minus any Skill already on the board.
 */
export function trendingBoardRows(feed: LegacyTrendingFeed): TrendingBoardRow[] {
  const ranked = feed.namedSkills.flatMap((entry) => {
    const signal = signalOf(entry)
    return signal ? [{ skill: { owner: entry.owner, repo: entry.repo, name: entry.name }, signal }] : []
  })
  const shown = new Set(feed.namedSkills.map(entry => entry.registryPath))
  const filler = feed.fallback
    .filter(entry => !shown.has(entry.registryPath))
    .map((entry): TrendingBoardRow => ({ skill: { owner: entry.owner, repo: entry.repo, name: entry.name }, signal: { kind: 'star-count' } }))
  return [...ranked, ...filler].slice(0, TRENDING_BOARD_LIMIT)
}

/**
 * The board as Skill cards. A row whose Skill the registry no longer holds
 * leaves the board, and `total` counts the rows that remain.
 */
export function presentTrending(
  rows: readonly TrendingBoardRow[],
  cards: ReadonlyMap<string, SkillCardSource>,
  limit: number,
): OperationResult<typeof trendingV1.operations.list> {
  const items = rows.flatMap((row) => {
    const card = cards.get(`${row.skill.owner}/${row.skill.repo}/${row.skill.name}`)
    if (!card)
      return []
    const summary = presentSkillSummary(card)
    return isAnswerableSkillSummary(summary) ? [{ ...summary, signal: row.signal }] : []
  })
  return { items: items.slice(0, limit), total: items.length }
}
