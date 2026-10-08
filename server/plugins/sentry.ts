import { createSentryInitOptions } from '@harlan-zw/nuxt-sentry/server'
import { SDK_VERSION } from '@sentry/cloudflare'
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins'
import { isBestEffortCacheWriteError, isExpectedUpstreamOutageError, isMcpAcceptProbeError, isMcpProtocolProbeError, scrubSentryBreadcrumb, scrubSentryEvent } from '../../shared/sentry'

function isDroppedSignature(error: unknown): boolean {
  return isBestEffortCacheWriteError(error) || isExpectedUpstreamOutageError(error) || isMcpAcceptProbeError(error) || isMcpProtocolProbeError(error)
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
    ...createSentryInitOptions({ sdkVersion: SDK_VERSION, dataCollection: 'none', logs: false }),
    beforeBreadcrumb: scrubSentryBreadcrumb,
    // Sentry 11 streams spans by default and skips `beforeSendTransaction`, so
    // a traced URL would leave unscrubbed. Static keeps every trace on that hook.
    traceLifecycle: 'static',
    beforeSendTransaction: scrubSentryEvent,
    // Nitro's route cache catches its own KV write failures and forwards the
    // caught error here as unhandled (SKILLD-17). The registry handlers'
    // intended upstream-outage 503s land here the same way (SKILLD-11,
    // SKILLD-1E), as do MCP probe rejections: 406 (SKILLD-35) and 400 (SKILLD-3H).
    // All are failure classes already answered or recorded, so drop the
    // duplicates and keep the wide events as the visibility path.
    beforeSend(event, hint) {
      const values = event.exception?.values ?? []
      if (isDroppedSignature(hint.originalException) || values.some(isDroppedSignature))
        return null
      return scrubSentryEvent(event)
    },
  })(nitroApp)
})
