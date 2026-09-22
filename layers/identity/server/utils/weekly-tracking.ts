/**
 * Parsing for the links old weekly and digest emails carry.
 *
 * Delivered emails rewrote every same-origin link through `/api/e/weekly`,
 * and those links are still sitting in inboxes. The recording is retired, but
 * the endpoint lives on as a redirect, so this module keeps the one job that
 * remains: parsing a query into a destination that cannot redirect off-site.
 */

export type WeeklyPlacement = 'liked' | 'trending' | 'cta' | 'footer' | 'overflow' | 'share'

export type WeeklyClickTarget
  = | { _tag: 'ok', path: string, placement: WeeklyPlacement, windowEnd: number, userId: number | null }
    | { _tag: 'invalid', reason: 'missing-path' | 'not-site-relative' | 'bad-placement' }

const PLACEMENTS = new Set<string>(['liked', 'trending', 'cta', 'footer', 'overflow', 'share'])

/**
 * Parses the query once, at the boundary, into something that cannot redirect
 * off-site. Everything downstream trusts it.
 */
export function parseWeeklyClick(query: Record<string, unknown>): WeeklyClickTarget {
  const path = typeof query.p === 'string' ? query.p : ''
  if (!path)
    return { _tag: 'invalid', reason: 'missing-path' }
  // A single leading slash and nothing that resolves to another origin. The
  // backslash forms are rejected because some clients normalise them to '/'.
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\'))
    return { _tag: 'invalid', reason: 'not-site-relative' }

  const placement = typeof query.k === 'string' ? query.k : ''
  if (!PLACEMENTS.has(placement))
    return { _tag: 'invalid', reason: 'bad-placement' }

  const windowEnd = Number(query.w)
  const userId = Number(query.u)

  return {
    _tag: 'ok',
    path,
    placement: placement as WeeklyPlacement,
    windowEnd: Number.isFinite(windowEnd) ? Math.trunc(windowEnd) : 0,
    userId: Number.isFinite(userId) && userId > 0 ? Math.trunc(userId) : null,
  }
}
