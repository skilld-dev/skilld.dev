import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins'
import { createSentryDataCollection, isBestEffortCacheWriteError } from '../../shared/sentry'

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
    // Nitro's route cache catches its own KV write failures and forwards the
    // caught error here as unhandled (SKILLD-17). That is the same failure
    // class `writeCache` records as a wide event, so drop the duplicate and
    // keep the wide event as the visibility path.
    beforeSend(event, hint) {
      const values = event.exception?.values ?? []
      if (isBestEffortCacheWriteError(hint.originalException) || values.some(isBestEffortCacheWriteError))
        return null
      return event
    },
  })(nitroApp)
})
