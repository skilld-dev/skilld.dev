import * as Sentry from '@sentry/nuxt'
import { createSentryDataCollection, SENTRY_DSN } from './shared/sentry'

if (!import.meta.dev) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    tracesSampleRate: 0.1,
    dataCollection: createSentryDataCollection(),
  })
}
