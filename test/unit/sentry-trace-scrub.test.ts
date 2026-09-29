import { CloudflareClient, createTransport, getCurrentScope, setCurrentClient, startSpan } from '@sentry/cloudflare'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { sentryCloudflareNitroPlugin } = vi.hoisted(() => ({
  sentryCloudflareNitroPlugin: vi.fn(),
}))

vi.mock('@sentry/nuxt/module/plugins', () => ({ sentryCloudflareNitroPlugin }))

async function serverPluginOptions(): Promise<Record<string, unknown>> {
  vi.stubGlobal('defineNitroPlugin', (plugin: (nitroApp: unknown) => void) => plugin)
  sentryCloudflareNitroPlugin.mockClear()
  sentryCloudflareNitroPlugin.mockReturnValue(vi.fn())
  const config = (useNuxtApp().$config as { sentry: Record<string, unknown> }).sentry
  config.enabled = true
  config.dsn = 'https://examplePublicKey@o0.ingest.sentry.io/0'
  config.tracesSampleRate = 1
  const registerPlugin = (await import('../../server/plugins/sentry')).default as (nitroApp: unknown) => void
  registerPlugin({})
  return sentryCloudflareNitroPlugin.mock.calls[0]![0]
}

afterEach(() => {
  getCurrentScope().setClient(undefined)
  vi.unstubAllGlobals()
})

describe('sentry server trace scrubbing', () => {
  it('strips a query string from a traced request before it leaves the Worker', async () => {
    const envelopes: string[] = []
    const client = new CloudflareClient({
      ...await serverPluginOptions(),
      integrations: [],
      stackParser: () => [],
      transport: options => createTransport(options, async (request) => {
        envelopes.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body))
        return {}
      }),
    } as ConstructorParameters<typeof CloudflareClient>[0])
    setCurrentClient(client)
    client.init()

    startSpan({
      name: 'GET /search?token=secret-oauth-code',
      forceTransaction: true,
      // A request span is URL sourced, so its name stays out of the envelope header.
      attributes: { 'sentry.segment.name.source': 'url', 'url.full': 'https://skilld.dev/search?token=secret-oauth-code' },
    }, () => {})
    await client.flush(1000)

    expect(envelopes.length).toBeGreaterThan(0)
    expect(envelopes.join('\n')).not.toContain('secret-oauth-code')
  })
})
