import type { NitroAppPlugin } from 'nitro/types'
import { captureException, getDefaultIntegrations, getIsolationScope, setAsyncLocalStorageAsyncContextStrategy } from '@sentry/cloudflare'
import { wrapRequestHandler } from '@sentry/cloudflare/request'

type RequestHandlerOptions = Parameters<typeof wrapRequestHandler>[0]
type WorkerRequest = Request & { runtime?: { cloudflare?: { context?: RequestHandlerOptions['context'] } } }

export function sentryCloudflareNitroPlugin(options: RequestHandlerOptions['options']): NitroAppPlugin {
  return (app) => {
    setAsyncLocalStorageAsyncContextStrategy()
    const scopes = new WeakSet<ReturnType<typeof getIsolationScope>>()
    const fetch = app.fetch.bind(app)
    app.fetch = (request) => {
      const workerRequest = request as WorkerRequest
      if (scopes.has(getIsolationScope()))
        return fetch(request)

      return wrapRequestHandler({
        options: { defaultIntegrations: getDefaultIntegrations(options), ...options },
        request,
        context: workerRequest.runtime?.cloudflare?.context,
        captureErrors: false,
      }, () => {
        scopes.add(getIsolationScope())
        return fetch(request)
      })
    }
    app.hooks.hook('error', (error) => {
      const status = (error as { status?: number, statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode
      if (status === undefined || status < 300 || status >= 500)
        captureException(error, { mechanism: { handled: false, type: 'auto.function.nuxt.nitro' } })
    })
  }
}
