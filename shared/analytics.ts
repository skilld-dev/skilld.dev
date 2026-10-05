/**
 * Anonymous usage analytics.
 *
 * skilld.dev needs to know which Skills people run and where they find them.
 * It does not need to know who they are. Every data point here goes to
 * Cloudflare Analytics Engine, which stores aggregates for 90 days and holds
 * no visitor IP address, no cookie, and no account id. The Worker never
 * forwards a request header to it.
 *
 * These builders are pure so the blob order is testable. A blob position is a
 * contract: an existing position never changes meaning, and a new field takes
 * the next free slot. Reordering would silently rewrite history in every
 * saved query.
 */

/** Which grammar the copied command speaks. */
export type CopyMode = 'run' | 'install'

/** What the copied command points at. */
export type CopyKind = 'skill' | 'collection' | 'repo'

export interface CopyEvent {
  /** Which surface printed the command, such as `skill-card` or `home-hero`. */
  surface: string
  mode: CopyMode
  kind: CopyKind
  /** `owner/name` for a Skill, `owner/repo` for a repository, `handle/slug` for a collection. */
  slug: string
  /** Two-letter country from `cf-ipcountry`, or `XX` when Cloudflare sends none. */
  country: string
}

export interface AnalyticsDataPoint {
  blobs: string[]
  doubles: number[]
  indexes: string[]
}

/**
 * Analytics Engine caps an index at 96 bytes and rejects longer ones, so a
 * long slug is cut rather than dropping the whole data point. The index is the
 * sampling key: grouping by Skill keeps per-Skill counts accurate under load.
 */
const MAX_INDEX_BYTES = 96

export function analyticsIndex(value: string): string {
  const fallback = value || 'unknown'
  return new TextEncoder().encode(fallback).length > MAX_INDEX_BYTES
    ? fallback.slice(0, 32)
    : fallback
}

/** A two-letter country, or `XX`. Anything else is a header a proxy invented. */
export function analyticsCountry(header: string | undefined): string {
  return header && /^[A-Z]{2}$/.test(header) ? header : 'XX'
}

/** Blobs: surface, mode, kind, slug, country. Doubles: one copy. */
export function copyDataPoint(event: CopyEvent): AnalyticsDataPoint {
  return {
    blobs: [event.surface, event.mode, event.kind, event.slug, event.country],
    doubles: [1],
    indexes: [analyticsIndex(event.slug)],
  }
}
