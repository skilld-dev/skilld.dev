export const SENTRY_DSN = 'https://b275b367f8096d04db8c2ebcfadc3aba@o4510507748163584.ingest.us.sentry.io/4511781692506112'

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
