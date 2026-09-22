/**
 * Aggregate click counts for the weekly and digest emails.
 *
 * Loop 2 is judged on digest click-throughs, and an email is the one surface
 * where nothing else can observe a click. So same-site links in a sent email
 * pass through `/api/e/{campaign}`, which adds one to a daily counter and
 * redirects.
 *
 * The link carries no reader. It names the campaign, the issue (the send's
 * `window_end`), the placement, and the destination path. Every recipient of an
 * issue gets identical links, so a click cannot be tied to a person, and the
 * counter stores nothing that could.
 *
 * The destination is never a URL. A same-site link carries a site-relative
 * path. A GitHub link carries only its path, and the route puts the
 * `github.com` origin back. A tracking redirect that accepts a URL is an open
 * redirect, and an open redirect reached from an email is a phishing
 * primitive, so neither form can express one.
 */

export type EmailCampaign = 'weekly' | 'digest'

export type EmailPlacement = 'liked' | 'trending' | 'cta' | 'footer' | 'overflow' | 'share'

/**
 * The only off-site host an email link may reach.
 *
 * Trending and liked rows point at SKILL.md on GitHub, which is where a reader
 * judges a change. Those clicks are the clearest Loop 2 evidence, so they are
 * counted rather than left dark. The origin is a constant here, so no request
 * can steer the redirect elsewhere.
 */
export const GITHUB_ORIGIN = 'https://github.com'

export interface EmailClickKey {
  campaign: EmailCampaign
  /** The send's `window_end`, in Unix seconds. Shared by every recipient. */
  issue: number
  placement: EmailPlacement
  /**
   * What was clicked. A same-site link stores its path with any query or
   * fragment removed. A GitHub link stores `gh:/owner/repo`, so a new commit
   * sha does not start a new row and weeks stay comparable.
   */
  path: string
}

export type EmailClick
  = | { _tag: 'counted', to: string, key: EmailClickKey }
    /** A safe destination that is not counted. Old links still land. */
    | { _tag: 'uncounted', to: string, reason: 'legacy-link' | 'bad-campaign' | 'bad-placement' | 'bad-issue' }
    | { _tag: 'invalid', reason: 'missing-path' | 'not-site-relative' | 'path-too-long' }

export const EMAIL_CLICK_ROUTE = '/api/e'

/** Longer paths are not a page this site sends, and they bloat the counter. */
const MAX_PATH_LENGTH = 512

const CAMPAIGNS = new Set<string>(['weekly', 'digest'])
const PLACEMENTS = new Set<string>(['liked', 'trending', 'cta', 'footer', 'overflow', 'share'])

/** Backslash, whitespace, or a control character. */
function unsafePathCharacter(character: string): boolean {
  const code = character.codePointAt(0)!
  return character === '\\' || code <= 0x20 || code === 0x7F || /\s/.test(character)
}

/**
 * A path that cannot leave the site, or the reason it could.
 *
 * `//host` and `/\host` resolve to another origin in browsers. Browsers also
 * strip tabs and newlines before parsing, so `/\t/host` becomes `//host`.
 * This rejects any backslash, whitespace, or control character for that reason.
 */
export function parseSiteRelativePath(value: unknown): { _tag: 'ok', path: string } | { _tag: 'invalid', reason: 'missing-path' | 'not-site-relative' | 'path-too-long' } {
  if (typeof value !== 'string' || !value)
    return { _tag: 'invalid', reason: 'missing-path' }
  if (value.length > MAX_PATH_LENGTH)
    return { _tag: 'invalid', reason: 'path-too-long' }
  if (!value.startsWith('/') || value.startsWith('//') || [...value].some(unsafePathCharacter))
    return { _tag: 'invalid', reason: 'not-site-relative' }

  // Second opinion from a real URL parser: the path must keep the base origin.
  const base = 'https://origin.invalid'
  if (!URL.canParse(value, base) || new URL(value, base).origin !== base)
    return { _tag: 'invalid', reason: 'not-site-relative' }

  return { _tag: 'ok', path: value }
}

function parseIssue(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value))
    return null
  const issue = Number(value)
  return issue > 0 ? issue : null
}

function countedPath(to: string): string {
  const end = to.search(/[?#]/)
  return end === -1 ? to : to.slice(0, end)
}

/** `gh:/owner/repo`, which is the counter identity of every GitHub link. */
export function githubCountedPath(path: string): string {
  const [owner, repo] = path.split('/').filter(Boolean)
  return `gh:/${owner ?? ''}${repo ? `/${repo}` : ''}`
}

/**
 * Parses one click request at the boundary.
 *
 * `campaign` is the route segment. The query carries `p` (placement), `i`
 * (issue), and one destination: `to` for a path on this site, or `g` for a
 * path on GitHub. Links sent before counting was restored carry `p` as the
 * path and `k` as the placement; they still redirect, uncounted.
 */
export function parseEmailClick(campaign: unknown, query: Record<string, unknown>): EmailClick {
  if (query.to === undefined && query.g === undefined && query.k !== undefined) {
    const legacy = parseSiteRelativePath(query.p)
    return legacy._tag === 'ok' ? { _tag: 'uncounted', to: legacy.path, reason: 'legacy-link' } : legacy
  }

  // A GitHub link is validated with the same parser, then the constant origin
  // is put back. The request never supplies a host.
  const offSite = query.g !== undefined
  const target = parseSiteRelativePath(offSite ? query.g : query.to)
  if (target._tag === 'invalid')
    return target
  const to = offSite ? `${GITHUB_ORIGIN}${target.path}` : target.path

  if (typeof campaign !== 'string' || !CAMPAIGNS.has(campaign))
    return { _tag: 'uncounted', to, reason: 'bad-campaign' }
  if (typeof query.p !== 'string' || !PLACEMENTS.has(query.p))
    return { _tag: 'uncounted', to, reason: 'bad-placement' }
  const issue = parseIssue(query.i)
  if (issue === null)
    return { _tag: 'uncounted', to, reason: 'bad-issue' }

  return {
    _tag: 'counted',
    to,
    key: {
      campaign: campaign as EmailCampaign,
      issue,
      placement: query.p as EmailPlacement,
      path: offSite ? githubCountedPath(target.path) : countedPath(to),
    },
  }
}

export interface EmailLinkContext {
  siteUrl: string
  campaign: EmailCampaign
  issue: number
}

/**
 * The counted form of one email link, or the link unchanged.
 *
 * A link to this site is rewritten with `to`, and a link to GitHub with `g`.
 * Any other host stays as it is. A link this cannot rewrite costs a count,
 * never a broken email.
 */
export function countedEmailUrl(context: EmailLinkContext, url: string, placement: EmailPlacement): string {
  const origin = context.siteUrl.replace(/\/+$/, '')
  const target = url.startsWith(`${GITHUB_ORIGIN}/`)
    ? { key: 'g', path: url.slice(GITHUB_ORIGIN.length) }
    : url === origin
      ? { key: 'to', path: '/' }
      : url.startsWith(`${origin}/`) ? { key: 'to', path: url.slice(origin.length) } : null
  if (!target || parseSiteRelativePath(target.path)._tag === 'invalid')
    return url

  const params = new URLSearchParams({ [target.key]: target.path, p: placement, i: String(context.issue) })
  return `${origin}${EMAIL_CLICK_ROUTE}/${context.campaign}?${params.toString()}`
}

/** The UTC calendar day a click lands in, as `YYYY-MM-DD`. */
export function emailClickDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Adds one click to its daily counter row.
 *
 * The row key is the whole record: day, campaign, issue, placement, and path.
 * No reader, address, or client detail is stored.
 */
export async function recordEmailClick(db: D1Database, key: EmailClickKey, now: Date): Promise<void> {
  await db.prepare(
    `INSERT INTO email_click_counts (day, campaign, issue, placement, path, clicks)
     VALUES (?1, ?2, ?3, ?4, ?5, 1)
     ON CONFLICT (day, campaign, issue, placement, path) DO UPDATE SET clicks = clicks + 1`,
  ).bind(emailClickDay(now), key.campaign, key.issue, key.placement, key.path).run()
}
