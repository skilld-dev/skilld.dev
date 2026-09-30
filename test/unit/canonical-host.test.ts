import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, setResponseHeader } from 'h3'
import { describe, expect, it } from 'vitest'
import canonicalHost from '../../server/middleware/canonical-host'
import { canonicalHostRedirect } from '../../server/utils/canonical-host'

describe('canonicalHostRedirect', () => {
  it.each([
    ['www.skilld.dev', '/gh/owner/repo/skill?tab=files', 'https://skilld.dev/gh/owner/repo/skill?tab=files'],
    ['www.skilld.dev', '/', 'https://skilld.dev/'],
    ['www.skilld.dev', '/sitemap.xml', 'https://skilld.dev/sitemap.xml'],
    ['WWW.skilld.dev', '/skills', 'https://skilld.dev/skills'],
    ['www.skilld.dev:443', '/skills?q=a%20b', 'https://skilld.dev/skills?q=a%20b'],
  ])('sends %s%s to the apex', (host, path, expected) => {
    expect(canonicalHostRedirect(host, path)).toBe(expected)
  })

  it('keeps a double slash inside the path, never as a host', () => {
    expect(canonicalHostRedirect('www.skilld.dev', '//evil.example/x'))
      .toBe('https://skilld.dev//evil.example/x')
  })

  it('never lets a path without a leading slash become a userinfo host', () => {
    expect(canonicalHostRedirect('www.skilld.dev', '@evil.example'))
      .toBe('https://skilld.dev/@evil.example')
  })

  it.each([
    'skilld.dev',
    'SKILLD.DEV:8787',
    'localhost:3000',
    'preview.skilld.dev',
    'www.skilld.dev.example.com',
    'notwww.skilld.dev',
    '',
  ])('leaves %s alone', (host) => {
    expect(canonicalHostRedirect(host, '/gh/owner/repo')).toBeNull()
  })
})

// Workers Cache keys on the path and query, never the host. A stored www
// redirect would answer the apex URL too and send it to itself.
describe('canonical host middleware', () => {
  function event(host: string, path: string) {
    const req = new IncomingMessage(new Socket())
    req.headers.host = host
    req.url = path
    const res = new ServerResponse(req)
    return { event: createEvent(req, res), res }
  }

  it('never lets a shared cache keep the www redirect', async () => {
    const { event: request, res } = event('www.skilld.dev', '/skills/trending?range=all')
    setResponseHeader(request, 'cloudflare-cdn-cache-control', 'public, max-age=60, stale-while-revalidate=3600')

    await canonicalHost(request)

    expect(res.statusCode).toBe(301)
    expect(res.getHeader('location')).toBe('https://skilld.dev/skills/trending?range=all')
    expect(res.getHeader('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(res.getHeader('cache-control')).toBe('private, no-store')
  })

  it('leaves an apex request and its cache policy alone', async () => {
    const { event: request, res } = event('skilld.dev', '/skills/trending')
    setResponseHeader(request, 'cloudflare-cdn-cache-control', 'public, max-age=60')

    expect(await canonicalHost(request)).toBeUndefined()
    expect(res.getHeader('cloudflare-cdn-cache-control')).toBe('public, max-age=60')
  })
})
