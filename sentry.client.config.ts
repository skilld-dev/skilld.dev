import { createSentryInitOptions } from '@harlan-zw/nuxt-sentry/server'
import * as Sentry from '@sentry/nuxt'
import { filterClientReport, isLocalReportingHost, scrubSentryBreadcrumb, scrubSentryEvent, SENTRY_DSN, SENTRY_TUNNEL_PATH } from './shared/sentry'

if (!import.meta.dev && window.location.protocol === 'https:' && !isLocalReportingHost(window.location.hostname)) {
  // No `release` here on purpose. The Sentry bundler plugin injects the release
  // it was configured with into the client bundle, and the SDK reads that when
  // the option is absent. Passing it explicitly would mean reading process.env
  // from browser code, which is not reliably defined.
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    // Envelopes go to the Worker, which forwards them, so sentry.io never
    // receives a visitor's IP address.
    tunnel: SENTRY_TUNNEL_PATH,
    // No browser performance tracing and no session tracking. Errors only.
    tracesSampleRate: 0,
    integrations: defaults => defaults.filter(integration => integration.name !== 'BrowserSession'),
    // `none` sends `infer_ip: never`, so Sentry ingest never fills in an IP.
    ...createSentryInitOptions({ sdkVersion: Sentry.SDK_VERSION, dataCollection: 'none', logs: false }),
    beforeBreadcrumb: scrubSentryBreadcrumb,
    // Sentry 11 streams spans by default and skips `beforeSendTransaction`.
    traceLifecycle: 'static',
    beforeSendTransaction: scrubSentryEvent,
    // Stale hashed chunks after a deploy: Nuxt's built-in nuxt:chunk-reload
    // plugin already recovers the navigation with a hard reload, so these are
    // benign, self-healing, and pure dashboard noise (Sentry SKILLD-4).
    ignoreErrors: [
      /Failed to fetch dynamically imported module/i,
      /Importing a module script failed/i,
      /error loading dynamically imported module/i,
    ],
    // Drops the closed BroadcastChannel race (SKILLD-12), cancelled requests,
    // and other reports that name no site defect. See `filterClientReport`.
    beforeSend: filterClientReport,
  })
}
