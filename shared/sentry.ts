import type { Breadcrumb, Event, EventHint } from '@sentry/nuxt'
import { isTransientError } from '@harlan-zw/nuxt-sentry/server'

export const SENTRY_DSN = 'https://b275b367f8096d04db8c2ebcfadc3aba@o4510507748163584.ingest.us.sentry.io/4511781692506112'

/**
 * Same-origin path the browser SDK posts envelopes to. The Worker forwards
 * them, so sentry.io never sees a visitor's IP address.
 */
export const SENTRY_TUNNEL_PATH = '/api/monitoring'

export function sentryReportingEnabled(env: {
  nodeEnv: string | undefined
  ci: string | undefined
}): boolean {
  if (env.nodeEnv !== 'production' || !env.ci)
    return false
  const ci = env.ci.trim().toLowerCase()
  return ci !== '' && ci !== 'false' && ci !== '0'
}

export function isLocalReportingHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '::1'
    || hostname === '0.0.0.0'
    || hostname.endsWith('.localhost')
}

/**
 * The commit a build came from, stamped into every Sentry event as its release.
 *
 * Events carried no release at all until 2026-08-05. Triaging `SKILLD-F` then
 * cost several reads that a release tag would have answered outright, because
 * "which version served this" was the first question and the events could not
 * answer it. The same gap keeps uploaded sourcemaps from ever matching an event,
 * since the bundler plugin associates them with a release name nothing reported
 * at runtime.
 *
 * Resolved at build time. `GITHUB_SHA` covers CI, which is the only place that
 * builds production, and `SENTRY_RELEASE` overrides it for a manual build.
 */
export function sentryRelease(): string | undefined {
  return process.env.SENTRY_RELEASE || process.env.GITHUB_SHA || undefined
}

/**
 * The message an error carries as it reaches the Sentry `beforeSend` hook.
 *
 * The hook sees two shapes. `hint.originalException` is the thrown `Error`,
 * so the message sits on `.message`. A serialized exception value inside
 * `event.exception.values` is a plain object, and Sentry puts the message on
 * `.value` (an `H3Error` serialized by Nitro keeps `.message`).
 */
function sentryExceptionMessage(error: unknown): unknown {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
      ? (error as { message?: unknown }).message ?? (error as { value?: unknown }).value
      : undefined
}

/**
 * The message prefix Workers KV rejects every cache write with
 * (`KV PUT failed: 429 Too Many Requests`, Sentry SKILLD-17). Nitro's route
 * cache treats the rejection as best-effort: it catches it, logs it, and still
 * serves the response, then forwards the caught error to Sentry as unhandled.
 * `writeCache` (shared/server/cache.ts) holds the same line for the project's
 * own cache writes and records the failure as a wide event instead, so the
 * forwarded error is a duplicate of a failure class already handled. The
 * server Sentry config uses this predicate to drop exactly that signature in
 * `beforeSend`; every other error still reaches Sentry.
 */
export function isBestEffortCacheWriteError(error: unknown): boolean {
  const message = sentryExceptionMessage(error)
  return typeof message === 'string' && message.startsWith('KV PUT failed:')
}

/**
 * The message Chrome rejects a `postMessage` on a closed `BroadcastChannel`
 * with (`InvalidStateError`, Sentry SKILLD-12). nuxt-skew-protection's
 * multi-tab plugin closes its channel on `app:error`, and a version update
 * already in flight can still post to it. The tab is erroring or closing
 * anyway, and the other tabs pick the version up on their own poll, so the
 * rejection is benign. The client Sentry config drops exactly that signature
 * in `beforeSend`; a closed-channel post on any other target still lands.
 */
export function isClosedBroadcastChannelError(error: unknown): boolean {
  const message = sentryExceptionMessage(error)
  return message === 'Failed to execute \'postMessage\' on \'BroadcastChannel\': Channel is closed'
}

const CLIENT_NOISE_MESSAGE = /ResizeObserver loop|AsyncData request cancelled by |signal is aborted without reason|\/builds\/meta\/[\w-]+\.json": 404 /

/**
 * Browser reports that name no site defect.
 *
 * - `ResizeObserver loop ...`: a browser layout notice that `window.onerror`
 *   delivers as an error (SKILLD-5B).
 * - A cancelled request: Nuxt aborts an AsyncData fetch that a newer call or an
 *   unmount replaced (SKILLD-4Q, SKILLD-4S, SKILLD-59). `isTransientError` is
 *   the rule every site using `@harlan-zw/nuxt-sentry` already applies.
 * - A retired build's meta: a tab older than the skew protection window asks
 *   for its own build meta and gets 404 (SKILLD-4Y), the stale-deploy class
 *   `ignoreErrors` already drops for chunks.
 */
function isClientNoiseError(error: unknown): boolean {
  if (isTransientError(error))
    return true
  const message = sentryExceptionMessage(error)
  return typeof message === 'string' && CLIENT_NOISE_MESSAGE.test(message)
}

function isClientDroppedSignature(error: unknown): boolean {
  return isClosedBroadcastChannelError(error) || isClientNoiseError(error)
}

/**
 * The kind of value a messageless error was thrown with, never its content.
 *
 * Nuxt wraps a thrown non-Error, such as a load `Event`, in an H3 error with
 * an empty message, so the report reads "No error message" and loses the one
 * fact that explains it (SKILLD-54).
 */
function describeThrownCause(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.message !== '' || error.cause === undefined)
    return undefined
  const cause = error.cause
  if (typeof globalThis.Event === 'function' && cause instanceof globalThis.Event) {
    const target = cause.target as { tagName?: unknown } | null
    return typeof target?.tagName === 'string' ? `Event:${cause.type}:${target.tagName}` : `Event:${cause.type}`
  }
  if (cause instanceof Error)
    return cause.name
  if (typeof cause !== 'object' || cause === null)
    return typeof cause
  return Object.prototype.toString.call(cause).slice(8, -1)
}

/**
 * The browser `beforeSend`: drops the signatures above, tags what a
 * messageless error was thrown with, and scrubs everything it keeps.
 */
export function filterClientReport<T extends Event>(event: T, hint: EventHint): T | null {
  const values = event.exception?.values ?? []
  if (isClientDroppedSignature(hint.originalException) || values.some(isClientDroppedSignature))
    return null
  const thrownCause = describeThrownCause(hint.originalException)
  if (thrownCause)
    event.tags = { ...event.tags, 'thrown.cause': thrownCause }
  return scrubSentryEvent(event)
}

/**
 * The message prefix the MCP streamable transport rejects a probe with
 * ('Not Acceptable: Client must accept text/event-stream' for an Accept-less
 * GET, and the same prefix for a POST that misses one of the two accepted
 * types, Sentry SKILLD-35). The transport answers the probe with an intended
 * 406, then Nitro forwards its thrown error to Sentry as unhandled, so every
 * bot probe would archive a duplicate of a response the client already got.
 * The server Sentry config drops exactly that prefix in `beforeSend`; every
 * other error still reaches Sentry.
 */
export function isMcpAcceptProbeError(error: unknown): boolean {
  const message = sentryExceptionMessage(error)
  return typeof message === 'string' && message.startsWith('Not Acceptable: Client must accept')
}

/** MCP answers unsupported protocol probes with 400 before running a tool (SKILLD-3H). */
export function isMcpProtocolProbeError(error: unknown): boolean {
  const message = sentryExceptionMessage(error)
  return typeof message === 'string' && message.startsWith('Bad Request: Unsupported protocol version:')
}

/**
 * A URL without its query string or fragment. Query strings carry OAuth codes,
 * signed tokens, and search terms, so no URL reaches Sentry with one.
 */
export function stripUrlQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

const URL_DATA_KEYS = ['url', 'http.url', 'url.full', 'from', 'to'] as const
const QUERY_DATA_KEYS = ['http.query', 'http.fragment', 'url.query', 'url.fragment'] as const

function scrubUrlData(data: Record<string, unknown> | undefined): void {
  if (!data)
    return
  for (const key of URL_DATA_KEYS) {
    const value = data[key]
    if (typeof value === 'string')
      data[key] = stripUrlQuery(value)
  }
  for (const key of QUERY_DATA_KEYS)
    delete data[key]
}

/**
 * The breadcrumb Sentry may keep, or null to drop it.
 *
 * Console output and UI clicks can hold page text and form values, so they
 * never leave the browser. Fetch, XHR, and navigation breadcrumbs keep their
 * path and lose their query string.
 */
export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? ''
  if (category === 'console' || category.startsWith('ui.'))
    return null
  scrubUrlData(breadcrumb.data)
  if (breadcrumb.message && (category === 'fetch' || category === 'xhr' || category === 'navigation'))
    breadcrumb.message = stripUrlQuery(breadcrumb.message)
  return breadcrumb
}

/**
 * An event with no personal data left on it.
 *
 * Removes the user IP address, cookies, request headers other than the user
 * agent, request bodies, and every query string. Breadcrumbs and HTTP spans
 * get the same URL scrub. `dataCollection` already stops most of this at the
 * source; this is the last check before an event leaves the process.
 */
export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.user) {
    delete event.user.ip_address
    if (Object.keys(event.user).length === 0)
      delete event.user
  }
  if (event.request) {
    if (event.request.url)
      event.request.url = stripUrlQuery(event.request.url)
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.data
    const userAgent = event.request.headers?.['User-Agent'] ?? event.request.headers?.['user-agent']
    event.request.headers = userAgent ? { 'User-Agent': userAgent } : undefined
    if (!event.request.headers)
      delete event.request.headers
  }
  if (event.transaction)
    event.transaction = stripUrlQuery(event.transaction)
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubSentryBreadcrumb)
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null)
  }
  for (const span of event.spans ?? []) {
    scrubUrlData(span.data as Record<string, unknown> | undefined)
    if (span.op?.startsWith('http') && span.description)
      span.description = stripUrlQuery(span.description)
  }
  const traceData = event.contexts?.trace?.data as Record<string, unknown> | undefined
  scrubUrlData(traceData)
  return event
}

export type SentryTunnelTarget
  = | { _tag: 'forward', url: string }
    | { _tag: 'reject', reason: 'empty' | 'bad-header' | 'wrong-dsn' }

/**
 * Where the tunnel may forward one envelope.
 *
 * The envelope header names its DSN. Only the configured DSN host and project
 * are accepted, so the tunnel cannot relay to another Sentry project or host.
 */
export function parseSentryTunnelEnvelope(envelope: string, dsn: string): SentryTunnelTarget {
  const firstLine = envelope.split('\n', 1)[0]
  if (!firstLine)
    return { _tag: 'reject', reason: 'empty' }

  let header: unknown
  try {
    header = JSON.parse(firstLine)
  }
  catch {
    // An unparseable header is a malformed envelope, reported as a rejection.
    return { _tag: 'reject', reason: 'bad-header' }
  }
  const envelopeDsn = typeof header === 'object' && header !== null ? (header as { dsn?: unknown }).dsn : undefined
  if (typeof envelopeDsn !== 'string' || !URL.canParse(envelopeDsn))
    return { _tag: 'reject', reason: 'bad-header' }

  const expected = new URL(dsn)
  const actual = new URL(envelopeDsn)
  const projectId = expected.pathname.replace(/^\/+/, '')
  if (actual.host !== expected.host || actual.pathname.replace(/^\/+/, '') !== projectId)
    return { _tag: 'reject', reason: 'wrong-dsn' }

  return { _tag: 'forward', url: `https://${expected.host}/api/${projectId}/envelope/` }
}
