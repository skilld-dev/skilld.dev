export const SENTRY_DSN = 'https://b275b367f8096d04db8c2ebcfadc3aba@o4510507748163584.ingest.us.sentry.io/4511781692506112'

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
 * The suffix shared by the intended upstream-outage 503s the registry handlers
 * raise after `fetchUpstreamTree` or `fetchUpstreamText` reports the outage as
 * an operational wide event ('Skill source is unavailable upstream',
 * 'SKILL.md source is unavailable upstream', 'Asset source is unavailable
 * upstream', Sentry SKILLD-11 and SKILLD-1E). Nitro forwards the thrown
 * `createError` to Sentry as unhandled, so the capture duplicates a failure
 * class the wide event already records. The server Sentry config drops that
 * signature in `beforeSend`; every other error still reaches Sentry.
 *
 * The gone-source 410 ('Skill source is gone upstream') is a permanent
 * verdict, not an outage, and does not carry the suffix, so it still lands.
 */
export function isExpectedUpstreamOutageError(error: unknown): boolean {
  const message = sentryExceptionMessage(error)
  return typeof message === 'string' && message.endsWith('unavailable upstream')
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

export function createSentryDataCollection() {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: false,
      response: false,
    },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: {
      document: false,
      variables: false,
    },
    genAI: {
      inputs: false,
      outputs: false,
    },
    databaseQueryData: false,
    stackFrameVariables: false,
  }
}
