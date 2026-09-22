import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrubRumBeaconBody } from '../../shared/rum-beacon'

describe('rum beacon body scrub', () => {
  it('strips query strings and fragments from page and referrer URLs', () => {
    const body = JSON.stringify({
      location: 'https://skilld.dev/auth/github?code=abc&state=xyz',
      referrer: 'https://www.google.com/search?q=private+term#top',
      siteToken: 'token',
      timingsV2: { name: 'https://skilld.dev/me?t=1' },
    })

    const result = scrubRumBeaconBody(body)

    expect(result._tag).toBe('forward')
    expect(JSON.parse((result as { body: string }).body)).toEqual({
      location: 'https://skilld.dev/auth/github',
      referrer: 'https://www.google.com/search',
      siteToken: 'token',
      timingsV2: { name: 'https://skilld.dev/me' },
    })
  })

  it('scrubs the query string out of timing entry names in the forwarded body', () => {
    const body = JSON.stringify({
      timingsV2: [{ name: 'https://skilld.dev/auth/github?code=abc' }],
    })

    const result = scrubRumBeaconBody(body)

    expect(result._tag).toBe('forward')
    expect((result as { body: string }).body).not.toContain('?')
  })

  it('drops a body it cannot parse', () => {
    expect(scrubRumBeaconBody('location=https://skilld.dev/?code=abc')).toEqual({ _tag: 'drop', reason: 'unparseable' })
  })
})

describe('rum beacon proxy route', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards only the content type and the scrubbed body', async () => {
    const raw = vi.fn(async () => ({ status: 204, _data: null }))
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('getRequestURL', () => new URL('https://skilld.dev/_scripts/p/cloudflareinsights.com/cdn-cgi/rum'))
    vi.stubGlobal('isMethod', () => true)
    vi.stubGlobal('readRawBody', async () => JSON.stringify({ location: 'https://skilld.dev/?code=abc', referrer: '' }))
    vi.stubGlobal('getHeader', (_event: unknown, name: string) => name === 'content-type' ? 'application/json' : '203.0.113.9')
    vi.stubGlobal('setResponseStatus', vi.fn())
    vi.stubGlobal('$fetch', { raw })
    vi.resetModules()
    const handler = (await import('../../server/routes/_scripts/p/cloudflareinsights.com/cdn-cgi/rum')).default as unknown as (event: unknown) => Promise<unknown>

    await handler({ method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9', 'cookie': 'session=x' } })

    expect(raw).toHaveBeenCalledWith('https://cloudflareinsights.com/cdn-cgi/rum', {
      method: 'POST',
      body: JSON.stringify({ location: 'https://skilld.dev/', referrer: '' }),
      headers: { 'content-type': 'application/json' },
    })
  })
})
