/**
 * Click tracking for the weekly email.
 *
 * The email is the one surface with no analytics on it. Once it leaves the
 * Worker we learn nothing, so "did anyone open a skill from the digest" has
 * been unanswerable, and the trending section has been shipping on faith.
 *
 * Every same-origin link is rewritten to pass through `/api/e/weekly`, which
 * records the click and redirects. The redirect target is carried as a
 * site-relative path and the endpoint rebuilds the URL from the site origin, so
 * an off-site redirect is not expressible. That is deliberate: a tracking
 * redirect that accepts an absolute URL is an open redirect, and open redirects
 * in an email are a phishing primitive. Off-site links are left untracked
 * rather than made expressible.
 */

export type WeeklyPlacement = 'liked' | 'trending' | 'cta' | 'footer' | 'overflow'

export const WEEKLY_TRACK_PATH = '/api/e/weekly'

export interface WeeklyTrackContext {
  siteUrl: string
  userId: number | null
  windowEnd: number
}

/**
 * A site-relative path, or null when the URL points somewhere else.
 *
 * Protocol-relative URLs (`//evil.test`) are rejected explicitly. They parse as
 * a path but resolve as another origin, which is exactly the case a naive
 * `startsWith('/')` check waves through.
 */
export function siteRelativePath(url: string, siteUrl: string): string | null {
  if (url.startsWith('//'))
    return null
  if (url.startsWith('/'))
    return url

  const origin = siteUrl.replace(/\/+$/, '')
  if (!url.startsWith(`${origin}/`))
    return null

  const path = url.slice(origin.length)
  return path.startsWith('//') ? null : path
}

/**
 * The tracked form of one link, or the original when it cannot be tracked.
 *
 * Returning the original rather than dropping the link means a bug here costs
 * a measurement, never a broken email.
 */
export function trackedUrl(
  context: WeeklyTrackContext,
  url: string,
  placement: WeeklyPlacement,
): string {
  const path = siteRelativePath(url, context.siteUrl)
  if (path === null)
    return url

  const params = new URLSearchParams({
    p: path,
    k: placement,
    w: String(context.windowEnd),
  })
  if (context.userId !== null)
    params.set('u', String(context.userId))

  return `${context.siteUrl.replace(/\/+$/, '')}${WEEKLY_TRACK_PATH}?${params.toString()}`
}

export type WeeklyClickTarget
  = | { _tag: 'ok', path: string, placement: WeeklyPlacement, windowEnd: number, userId: number | null }
    | { _tag: 'invalid', reason: 'missing-path' | 'not-site-relative' | 'bad-placement' }

const PLACEMENTS = new Set<string>(['liked', 'trending', 'cta', 'footer', 'overflow'])

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
