import * as Sentry from '@sentry/nuxt'
import { createSentryDataCollection, SENTRY_DSN } from './shared/sentry'

if (!import.meta.dev) {
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
  })
}
