/**
 * Proves, against a deployed site, that a page under an `edgeCache` route rule
 * is safe in Workers Cache and actually served from it.
 *
 * Workers Cache answers a hit without running the Worker, keys on the path,
 * query and the `Vary` headers, and does not bypass a request that carries a
 * cookie. So a stored page reaches every visitor, and four things must hold:
 *
 * 1. A repeat anonymous browser request comes from the cache.
 * 2. No anonymous response sets a cookie, or the edge refuses to store it.
 * 3. An agent that asks for Markdown still gets the 307 to the `.md` URL.
 * 4. A request that carries a session cookie gets the anonymous render, and
 *    the page tells the browser to load the session itself.
 * 5. www answers a 301 to the apex, also once the apex entry is warm: the
 *    cache key has no hostname, so `Vary: Host` must keep the variants apart.
 * 6. Every board is stored under its own key: boards that differ only by query
 *    string render a different title or canonical URL. The bare path and the
 *    default range are one board, so they may share both.
 */

import { varyKeysEdgeCache } from '../../shared/content-negotiation'
import { DEFAULT_TRENDING_RANGE } from '../../shared/trending-range'

/** The pages `nuxt.config.ts` gives an `edgeCache` rule. Each query is its own cache key. */
export const EDGE_CACHED_PATHS = ['/', '/skills/trending', '/skills/trending?range=month', '/skills/trending?range=all']

const BROWSER_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'user-agent': 'Mozilla/5.0 (compatible; skilld-edge-cache-check/1; +https://skilld.dev)',
}

/** Opaque on purpose: the page must not read it, so it never needs to unseal. */
const SESSION_COOKIE = 'nuxt-session=edge-cache-check'

/** The bare path and the default range name one board, so one canonical URL. */
const DEFAULT_BOARD_ALIASES = new Set(['/skills/trending', `/skills/trending?range=${DEFAULT_TRENDING_RANGE}`])

/** `cf-cache-status` values that mean the edge answered without the Worker. */
const SERVED_FROM_CACHE = new Set(['HIT', 'STALE', 'UPDATING'])

export type EdgeCacheFetch = (input: string, init: RequestInit) => Promise<Response>

export type EdgeCacheRequest = 'anonymous' | 'markdown' | 'session-cookie'

export type EdgeCacheFailure
  = | { _tag: 'network-error', path: string, request: EdgeCacheRequest, message: string }
    | { _tag: 'status', path: string, request: EdgeCacheRequest, expected: number, actual: number }
    | { _tag: 'sets-cookie', path: string, request: EdgeCacheRequest, cookies: string[] }
    | { _tag: 'vary', path: string, request: EdgeCacheRequest, actual: string | null }
    | { _tag: 'never-served-from-cache', path: string, cacheStatuses: string[] }
    | { _tag: 'markdown-location', path: string, actual: string | null }
    | { _tag: 'rendered-for-session', path: string, reason: string }
    | { _tag: 'www-redirect', path: string, status: number | null, location: string | null, message?: string }
    | { _tag: 'shared-cache-entry', paths: string[], identity: string | null }

export type EdgeCacheCheckResult
  = | { _tag: 'passed', checks: Array<{ path: string, cacheStatuses: string[] }> }
    | { _tag: 'failed', failures: EdgeCacheFailure[] }

export interface EdgeCacheCheckDependencies {
  baseUrl: string
  paths?: string[]
  fetch?: EdgeCacheFetch
  /** Where www lives. Defaults to `www.` on the apex when `baseUrl` is `skilld.dev`; null skips the check. */
  wwwBaseUrl?: string | null
  wait?: (milliseconds: number) => Promise<void>
  /**
   * Repeat requests allowed after the first before the path fails. A deploy
   * moves traffic to a new Worker version, and the version is part of the
   * cache key, so the first few requests can land on a cold key.
   */
  hitAttempts?: number
  retryDelayMs?: number
}

type Fetched
  = | { _tag: 'ok', response: Response, body: string }
    | { _tag: 'error', message: string }

async function request(fetch: EdgeCacheFetch, url: string, headers: Record<string, string>): Promise<Fetched> {
  try {
    const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    return { _tag: 'ok', response, body: await response.text() }
  }
  catch (error) {
    return { _tag: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

function cookieNames(response: Response): string[] {
  return response.headers.getSetCookie().map(cookie => cookie.split('=')[0]!.trim())
}

function markdownPath(path: string): string {
  const pathname = path.split('?')[0]!.replace(/\/+$/, '')
  return pathname ? `${pathname}.md` : '/index.md'
}

/**
 * Why a page body is not the anonymous render, or null when it is.
 *
 * The Nuxt payload serializes state as an array whose objects point at other
 * slots, so `$snuxt-session` names the slot that holds the session.
 */
function sessionRenderProblem(html: string): string | null {
  if (!html.includes('auth:{loadStrategy:"client-only"}'))
    return 'the runtime config does not load the session in the browser'
  const payload = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!payload)
    return 'the page has no Nuxt payload'
  let data: unknown
  try {
    data = JSON.parse(payload)
  }
  catch {
    return 'the Nuxt payload is not JSON'
  }
  if (!Array.isArray(data))
    return 'the Nuxt payload is not an array'
  const state = data.find((entry): entry is Record<string, number> =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry) && '$snuxt-session' in entry)
  if (!state)
    return 'the payload carries no session state'
  if (data[state['$snuxt-session']!] !== null)
    return 'the payload carries a session'
  if ('$snuxt-auth-ready' in state && data[state['$snuxt-auth-ready']!] !== false)
    return 'the payload marks the session as loaded'
  return null
}

/**
 * What a page says about itself: its `<title>` and canonical URL. Two ranges
 * that share both were answered from one cache entry, or render one board.
 */
function pageIdentity(html: string): string | null {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
  const canonical = html.match(/<link\s[^>]*rel="canonical"[^>]*>/i)?.[0].match(/href="([^"]*)"/i)?.[1]
  return title || canonical ? `${title ?? ''} | ${canonical ?? ''}` : null
}

/** One retry after a delay: a deploy or an origin restart can answer a 5xx once. */
async function requestAnonymous(
  url: string,
  input: { fetch: EdgeCacheFetch, wait: (milliseconds: number) => Promise<void>, retryDelayMs: number },
): Promise<Fetched> {
  const first = await request(input.fetch, url, BROWSER_HEADERS)
  if (first._tag === 'error' || first.response.status === 200)
    return first
  await input.wait(input.retryDelayMs)
  return request(input.fetch, url, BROWSER_HEADERS)
}

async function checkAnonymous(
  path: string,
  url: string,
  input: { fetch: EdgeCacheFetch, wait: (milliseconds: number) => Promise<void>, hitAttempts: number, retryDelayMs: number },
): Promise<{ _tag: 'passed', cacheStatuses: string[], identity: string | null } | { _tag: 'failed', failure: EdgeCacheFailure }> {
  const cacheStatuses: string[] = []
  let identity: string | null = null
  for (let attempt = 0; attempt <= input.hitAttempts; attempt++) {
    const fetched = await requestAnonymous(url, input)
    if (fetched._tag === 'error')
      return { _tag: 'failed', failure: { _tag: 'network-error', path, request: 'anonymous', message: fetched.message } }
    const { response } = fetched
    identity = pageIdentity(fetched.body)
    if (response.status !== 200)
      return { _tag: 'failed', failure: { _tag: 'status', path, request: 'anonymous', expected: 200, actual: response.status } }
    const cookies = cookieNames(response)
    if (cookies.length)
      return { _tag: 'failed', failure: { _tag: 'sets-cookie', path, request: 'anonymous', cookies } }
    const vary = response.headers.get('vary')
    if (!varyKeysEdgeCache(vary))
      return { _tag: 'failed', failure: { _tag: 'vary', path, request: 'anonymous', actual: vary } }

    const status = (response.headers.get('cf-cache-status') ?? 'NONE').toUpperCase()
    cacheStatuses.push(status)
    if (attempt > 0 && SERVED_FROM_CACHE.has(status))
      return { _tag: 'passed', cacheStatuses, identity }
    if (attempt < input.hitAttempts && attempt > 0)
      await input.wait(input.retryDelayMs)
  }
  return { _tag: 'failed', failure: { _tag: 'never-served-from-cache', path, cacheStatuses } }
}

async function checkMarkdown(path: string, url: string, fetch: EdgeCacheFetch): Promise<EdgeCacheFailure | null> {
  const fetched = await request(fetch, url, { accept: 'text/markdown' })
  if (fetched._tag === 'error')
    return { _tag: 'network-error', path, request: 'markdown', message: fetched.message }
  const { response } = fetched
  if (response.status !== 307)
    return { _tag: 'status', path, request: 'markdown', expected: 307, actual: response.status }
  const location = response.headers.get('location')
  if (!location || new URL(location, url).pathname !== markdownPath(path))
    return { _tag: 'markdown-location', path, actual: location }
  const vary = response.headers.get('vary')
  if (!varyKeysEdgeCache(vary))
    return { _tag: 'vary', path, request: 'markdown', actual: vary }
  return null
}

async function checkSessionCookie(path: string, url: string, fetch: EdgeCacheFetch): Promise<EdgeCacheFailure | null> {
  const fetched = await request(fetch, url, { ...BROWSER_HEADERS, cookie: SESSION_COOKIE })
  if (fetched._tag === 'error')
    return { _tag: 'network-error', path, request: 'session-cookie', message: fetched.message }
  const { response, body } = fetched
  if (response.status !== 200)
    return { _tag: 'status', path, request: 'session-cookie', expected: 200, actual: response.status }
  // A request that carries a cookie is never stored, so nuxt-skew-protection
  // may still set its version cookie on a miss. A new session cookie would
  // mean the render opened the session.
  const sessionCookies = cookieNames(response).filter(name => name === 'nuxt-session')
  if (sessionCookies.length)
    return { _tag: 'sets-cookie', path, request: 'session-cookie', cookies: sessionCookies }
  const problem = sessionRenderProblem(body)
  if (problem)
    return { _tag: 'rendered-for-session', path, reason: problem }
  return null
}

function defaultWwwBaseUrl(baseUrl: string): string | null {
  const { protocol, hostname } = new URL(baseUrl)
  return hostname === 'skilld.dev' ? `${protocol}//www.${hostname}` : null
}

/** www must 301 to the same path and query on the apex, whatever the edge holds for the apex. */
async function checkWww(path: string, wwwBaseUrl: string, baseUrl: string, fetch: EdgeCacheFetch): Promise<EdgeCacheFailure | null> {
  const fetched = await request(fetch, new URL(path, wwwBaseUrl).href, BROWSER_HEADERS)
  if (fetched._tag === 'error')
    return { _tag: 'www-redirect', path, status: null, location: null, message: fetched.message }
  const { response } = fetched
  const location = response.headers.get('location')
  if (response.status === 301 && location === new URL(path, baseUrl).href)
    return null
  return { _tag: 'www-redirect', path, status: response.status, location }
}

export async function checkEdgeCache(dependencies: EdgeCacheCheckDependencies): Promise<EdgeCacheCheckResult> {
  const fetch = dependencies.fetch ?? globalThis.fetch
  const wait = dependencies.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const hitAttempts = Math.max(1, Math.floor(dependencies.hitAttempts ?? 12))
  const retryDelayMs = Math.max(0, Math.floor(dependencies.retryDelayMs ?? 5_000))
  const paths = dependencies.paths ?? EDGE_CACHED_PATHS
  const wwwBaseUrl = dependencies.wwwBaseUrl === undefined ? defaultWwwBaseUrl(dependencies.baseUrl) : dependencies.wwwBaseUrl

  const failures: EdgeCacheFailure[] = []
  const checks: Array<{ path: string, cacheStatuses: string[] }> = []
  const identities = new Map<string | null, string[]>()
  for (const path of paths) {
    const url = new URL(path, dependencies.baseUrl).href
    const anonymous = await checkAnonymous(path, url, { fetch, wait, hitAttempts, retryDelayMs })
    if (anonymous._tag === 'failed') {
      failures.push(anonymous.failure)
    }
    else {
      checks.push({ path, cacheStatuses: anonymous.cacheStatuses })
      identities.set(anonymous.identity, [...identities.get(anonymous.identity) ?? [], path])
    }

    // After the anonymous loop, so the apex entry is warm.
    const www = wwwBaseUrl ? await checkWww(path, wwwBaseUrl, dependencies.baseUrl, fetch) : null
    for (const failure of [await checkMarkdown(path, url, fetch), await checkSessionCookie(path, url, fetch), www]) {
      if (failure)
        failures.push(failure)
    }
  }

  for (const [identity, sharing] of identities) {
    if (sharing.length > 1 && !sharing.every(path => DEFAULT_BOARD_ALIASES.has(path)))
      failures.push({ _tag: 'shared-cache-entry', paths: sharing, identity })
  }

  return failures.length ? { _tag: 'failed', failures } : { _tag: 'passed', checks }
}
