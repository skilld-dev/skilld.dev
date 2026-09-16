import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins'
import { createSentryDataCollection, isBestEffortCacheWriteError, isExpectedUpstreamOutageError, scrubSentryBreadcrumb, scrubSentryEvent } from '../../shared/sentry'

function isDroppedSignature(error: unknown): boolean {
  return isBestEffortCacheWriteError(error) || isExpectedUpstreamOutageError(error)
}

export default defineNitroPlugin((nitroApp) => {
  const { sentry } = useRuntimeConfig()
  if (!sentry.enabled || !sentry.dsn)
    return

  sentryCloudflareNitroPlugin({
    dsn: sentry.dsn,
    environment: sentry.environment,
    // Empty when a build carried no commit, and the SDK must see undefined
    // rather than an empty string or every event reports release "".
    release: sentry.release || undefined,
    tracesSampleRate: sentry.tracesSampleRate,
    dataCollection: createSentryDataCollection(),
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendTransaction: scrubSentryEvent,
    // Nitro's route cache catches its own KV write failures and forwards the
    // caught error here as unhandled (SKILLD-17). The registry handlers'
    // intended upstream-outage 503s land here the same way (SKILLD-11,
    // SKILLD-1E). Both are failure classes already recorded as wide events,
    // so drop the duplicates and keep the wide events as the visibility path.
    beforeSend(event, hint) {
      const values = event.exception?.values ?? []
      if (isDroppedSignature(hint.originalException) || values.some(isDroppedSignature))
        return null
      return scrubSentryEvent(event)
    },
  })(nitroApp)
})
