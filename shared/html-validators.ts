/**
 * ETags for the HTML pages Workers Cache stores, and the 304 that answers one.
 *
 * Without a validator, every recrawl downloads every page again, and Workers
 * Cache replaces a stale page with a full render. With one, a crawler that
 * sends `If-None-Match` gets a 304, and a revalidating cache keeps its body.
 *
 * The ETag is weak: a weak ETag promises the same page, not the same bytes.
 * Cloudflare compresses responses and may rewrite a strong ETag. Each render
 * also carries a fresh Sentry trace id, which is not page content.
 *
 * There is no `Last-Modified`. A Skill page shows stars, ages and related
 * Skills, so no single date bounds what it renders. A date that misses a
 * change makes a cache answer `If-Modified-Since` with a wrong 304. A request
 * that sends only `If-Modified-Since` gets the full page.
 */

export interface HeaderReader {
  get: (name: string) => string | null
}

export interface RenderedPage {
  /** The Nuxt build id. A deploy changes it, so no ETag survives a deploy. */
  buildId: string
  method: string
  status: number
  /** A string for a whole rendered document. */
  body: unknown
  request: HeaderReader
  response: HeaderReader
}

export type HtmlValidatorSkipReason = 'method' | 'status' | 'not-html' | 'credentials' | 'sets-cookie' | 'not-shared'

export type HtmlValidatorDecision
  = | { _tag: 'skip', reason: HtmlValidatorSkipReason }
    | { _tag: 'send', etag: string }
    | { _tag: 'not-modified', etag: string }

/**
 * The request headers `@harlan-zw/nuxt-cloudflare` treats as credentials.
 * A page rendered for a request with one is never stored, so it gets no ETag.
 */
const CREDENTIAL_HEADERS = ['cookie', 'authorization', 'proxy-authorization', 'cf-access-jwt-assertion', 'cf-access-client-id', 'x-api-key']

const HTML_TYPE_RE = /^(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/i

/** Sentry writes these into every render with a new trace id. */
const PER_RENDER_META_RE = /<meta name="(?:sentry-trace|baggage)" content="[^"]*"\s*\/?>/g

const ENTITY_TAG_RE = /(?:W\/)?"[^"]*"/g

export async function decideHtmlValidators(page: RenderedPage): Promise<HtmlValidatorDecision> {
  if (page.method !== 'GET' && page.method !== 'HEAD')
    return { _tag: 'skip', reason: 'method' }
  if (page.status !== 200)
    return { _tag: 'skip', reason: 'status' }
  if (typeof page.body !== 'string' || !HTML_TYPE_RE.test(page.response.get('content-type') ?? ''))
    return { _tag: 'skip', reason: 'not-html' }
  if (CREDENTIAL_HEADERS.some(name => page.request.get(name)))
    return { _tag: 'skip', reason: 'credentials' }
  if (page.response.get('set-cookie'))
    return { _tag: 'skip', reason: 'sets-cookie' }
  if (!sharedCacheMayStore(page.response.get('cloudflare-cdn-cache-control')))
    return { _tag: 'skip', reason: 'not-shared' }

  const etag = `W/"${page.buildId}-${await contentHash(page.body.replace(PER_RENDER_META_RE, ''))}"`
  return ifNoneMatchHits(page.request.get('if-none-match'), etag)
    ? { _tag: 'not-modified', etag }
    : { _tag: 'send', etag }
}

/**
 * True when the edge policy lets Workers Cache store the page for one visitor
 * and serve it to the next. Only such a page is the same for everyone.
 */
function sharedCacheMayStore(cacheControl: string | null): boolean {
  let lifetime = 0
  for (const directive of (cacheControl ?? '').toLowerCase().split(',')) {
    const [name = '', value] = directive.trim().split('=', 2)
    // `private="set-cookie"` keeps one header private, never the page.
    if (name === 'no-store' || (name === 'private' && value === undefined))
      return false
    if (name === 'max-age' || name === 's-maxage')
      lifetime = Math.max(lifetime, Number(value) || 0)
  }
  return lifetime > 0
}

/** Weak comparison (RFC 9110 section 8.8.3.2), which `If-None-Match` uses. */
function ifNoneMatchHits(header: string | null, etag: string): boolean {
  if (!header)
    return false
  if (header.trim() === '*')
    return true
  const opaque = etag.replace(/^W\//, '')
  return (header.match(ENTITY_TAG_RE) ?? []).some(tag => tag.replace(/^W\//, '') === opaque)
}

async function contentHash(html: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html))
  return Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('')
}
