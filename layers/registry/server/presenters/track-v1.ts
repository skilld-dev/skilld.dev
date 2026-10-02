import type { OperationResult, tracksV1 } from 'skilld-sdk/contract'
import type { SkillCardSource } from '#shared/server/skill-cards'
import { SKILLD_V1_ORIGIN } from 'skilld-sdk/contract'
import { presentCount, presentSkillSummaries } from '#shared/server/skill-cards'

/** The fields of one `/api/clusters` card that `tracks.list` reads. */
export interface LegacyTrackCard {
  slug: string
  label: string
  userVoice: string
  skillCount: number
}

/** The fields of the `/api/clusters/<slug>` answer that `tracks.get` reads. */
export interface LegacyTrackPage {
  cluster: { slug: string, label: string, userVoice: string }
  /** Page order: pinned Skills first on page 1. */
  items: { owner: string, repo: string, name: string }[]
  total: number
}

/** Rows per page of `/api/clusters/<slug>` when the request names no limit, the page size the track page reads. */
export const LEGACY_TRACK_PAGE_SIZE = 60

function trackPageUrl(slug: string): string {
  return `${SKILLD_V1_ORIGIN}/skills/${slug}`
}

export function presentTrackList(cards: readonly LegacyTrackCard[]): OperationResult<typeof tracksV1.operations.list> {
  return {
    items: cards.map(card => ({
      slug: card.slug,
      label: card.label,
      line: card.userVoice,
      pageUrl: trackPageUrl(card.slug),
      skillCount: presentCount(card.skillCount),
    })),
    total: cards.length,
  }
}

/**
 * The legacy pages that cover `limit` rows from `offset`, and how many rows of
 * the first one to skip.
 *
 * The API reads whole pages at the size the track page reads, not pages sized
 * to the request. Page 1 is curated within its own rows, so a different page
 * size would order the first Skills differently from the page, and every
 * request would miss the cache the page fills.
 */
export function legacyTrackPages(window: { limit: number, offset: number }, pageSize = LEGACY_TRACK_PAGE_SIZE): { pages: number[], skip: number } {
  const first = Math.floor(window.offset / pageSize) + 1
  const last = Math.floor((window.offset + window.limit - 1) / pageSize) + 1
  return {
    pages: Array.from({ length: last - first + 1 }, (_, index) => first + index),
    skip: window.offset - (first - 1) * pageSize,
  }
}

export function presentTrack(
  track: LegacyTrackPage['cluster'],
  skills: readonly SkillCardSource[],
  total: number,
): OperationResult<typeof tracksV1.operations.get> {
  return {
    slug: track.slug,
    label: track.label,
    line: track.userVoice,
    pageUrl: trackPageUrl(track.slug),
    items: presentSkillSummaries(skills),
    total: presentCount(total),
  }
}
