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
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
      ? (error as { message?: unknown }).message ?? (error as { value?: unknown }).value
      : undefined
  return typeof message === 'string' && message.startsWith('KV PUT failed:')
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
