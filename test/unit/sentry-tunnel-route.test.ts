import { afterEach, describe, expect, it, vi } from 'vitest'

const DSN = 'https://b275b367f8096d04db8c2ebcfadc3aba@o4510507748163584.ingest.us.sentry.io/4511781692506112'

async function loadHandler(body: string) {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  const config = (useNuxtApp().$config as { sentry: Record<string, unknown> }).sentry
  config.enabled = true
  config.dsn = DSN
  vi.stubGlobal('readRawBody', async () => body)
  vi.stubGlobal('setResponseStatus', vi.fn())
  vi.stubGlobal('createError', (input: { statusCode: number }) => Object.assign(new Error('rejected'), input))
  vi.resetModules()
  return (await import('../../server/api/monitoring.post')).default as unknown as (event: unknown) => Promise<unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sentry tunnel route', () => {
  it('forwards the envelope with no visitor headers', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const envelope = `${JSON.stringify({ dsn: DSN })}\n{"type":"event"}\n{}`
    const handler = await loadHandler(envelope)

    await handler({ node: { req: { headers: { 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': '203.0.113.9' } } } })

    expect(fetch).toHaveBeenCalledWith(
      'https://o4510507748163584.ingest.us.sentry.io/api/4511781692506112/envelope/',
      { method: 'POST', headers: { 'content-type': 'application/x-sentry-envelope' }, body: envelope },
    )
  })

  it('refuses an envelope for another project without calling out', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const handler = await loadHandler(`${JSON.stringify({ dsn: 'https://key@evil.example/1' })}\n{}`)

    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
})
