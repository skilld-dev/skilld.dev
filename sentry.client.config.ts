import * as Sentry from '@sentry/nuxt'
import { createSentryDataCollection, isClosedBroadcastChannelError, isLocalReportingHost, SENTRY_DSN } from './shared/sentry'

if (!import.meta.dev && window.location.protocol === 'https:' && !isLocalReportingHost(window.location.hostname)) {
  // No `release` here on purpose. The Sentry bundler plugin injects the release
  // it was configured with into the client bundle, and the SDK reads that when
  // the option is absent. Passing it explicitly would mean reading process.env
  // from browser code, which is not reliably defined.
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    tracesSampleRate: 0.1,
    dataCollection: createSentryDataCollection(),
    // Stale hashed chunks after a deploy: Nuxt's built-in nuxt:chunk-reload
    // plugin already recovers the navigation with a hard reload, so these are
    // benign, self-healing, and pure dashboard noise (Sentry SKILLD-4).
    ignoreErrors: [
      /Failed to fetch dynamically imported module/i,
      /Importing a module script failed/i,
      /error loading dynamically imported module/i,
    ],
    // nuxt-skew-protection's multi-tab plugin closes its BroadcastChannel on
    // app:error, and an in-flight version update can still post to it. The
    // rejection is a benign tab-close race (SKILLD-12), so drop that one
    // signature and keep every other error.
    beforeSend(event, hint) {
      const values = event.exception?.values ?? []
      if (isClosedBroadcastChannelError(hint.originalException) || values.some(isClosedBroadcastChannelError))
        return null
      return event
    },
  })
}
