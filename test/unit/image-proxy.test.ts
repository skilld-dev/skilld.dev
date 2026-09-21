import type { ImageProxyRequest } from '#server/utils/image-proxy'
import { describe, expect, it } from 'vitest'
import {
  fetchProxiedImage,
  IMAGE_PROXY_MAX_BYTES,
  imageProxyResponse,
  importImageProxyKey,
  parseImageProxyRequest,
  signImageProxyUrl,
  verifyImageProxySignature,
} from '#server/utils/image-proxy'
import { avatarProxyUrl, githubAvatarProxyUrl, parseImageTarget } from '#shared/image-proxy'

function queryOf(path: string): Record<string, string> {
  return Object.fromEntries(new URL(path, 'https://skilld.dev').searchParams)
}

interface RecordedCall { url: string, headers: Headers, redirect: RequestRedirect | undefined }

function fakeFetch(responses: Record<string, () => Response>): { fetcher: typeof fetch, calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: new Headers(init?.headers), redirect: init?.redirect })
    const respond = responses[url]
    if (!respond)
      throw new Error(`unexpected fetch ${url}`)
    return respond()
  }) as typeof fetch
  return { fetcher, calls }
}

function redirect(location: string): () => Response {
  return () => new Response(null, { status: 302, headers: { location } })
}

function image(type: string, bytes = 4, extra: Record<string, string> = {}): () => Response {
  return () => new Response(new Uint8Array(bytes), { headers: { 'content-type': type, ...extra } })
}

const avatar = (url: string): ImageProxyRequest => ({ _tag: 'avatar', target: new URL(url) })
const signed = (url: string): ImageProxyRequest => ({ _tag: 'signed', target: new URL(url), signature: 'x'.repeat(43) })

describe('parseImageTarget', () => {
  it.each([
    ['http', 'http://img.shields.io/a.svg', 'not-https'],
    ['credentials', 'https://user:pass@img.shields.io/a.svg', 'credentials'],
    ['a non-default port', 'https://img.shields.io:8443/a.svg', 'port'],
    ['an IPv4 literal', 'https://10.0.0.1/a.png', 'ip-literal'],
    ['a hex IPv4 literal', 'https://0x7f000001/a.png', 'ip-literal'],
    ['an IPv6 literal', 'https://[::1]/a.png', 'ip-literal'],
    ['localhost', 'https://localhost/a.png', 'private-host'],
    ['a localhost subdomain', 'https://api.localhost./a.png', 'private-host'],
    ['an internal name', 'https://metadata.internal/a.png', 'private-host'],
    ['a single label host', 'https://intranet/a.png', 'private-host'],
    ['garbage', 'not a url', 'invalid-url'],
  ])('rejects %s', (_label, raw, reason) => {
    expect(parseImageTarget(raw)).toEqual({ _tag: 'Err', reason })
  })

  it('accepts a public https address on the default port and drops the fragment', () => {
    const result = parseImageTarget('https://img.shields.io:443/npm/v/skilld.svg?style=flat#x')
    expect(result._tag === 'Ok' && result.url.href).toBe('https://img.shields.io/npm/v/skilld.svg?style=flat')
  })
})

describe('avatar proxy addresses', () => {
  it.each([
    ['a GitHub avatar', 'https://avatars.githubusercontent.com/u/1?v=4'],
    ['a GitHub login avatar', 'https://github.com/harlan-zw.png'],
    ['an X avatar', 'https://pbs.twimg.com/profile_images/1/a_normal.jpg'],
    ['a Bluesky avatar', 'https://cdn.bsky.app/img/avatar/plain/did:plc:abc/bafk@jpeg'],
  ])('proxies %s', (_label, src) => {
    const path = avatarProxyUrl(src)!
    expect(path.startsWith('/_img/avatar?')).toBe(true)
    expect(parseImageProxyRequest('avatar', queryOf(path))).toEqual({ _tag: 'Ok', request: avatar(src) })
  })

  it.each([
    ['another host', 'https://tracker.example.com/pixel.gif'],
    ['a GitHub page', 'https://github.com/harlan-zw/skilld'],
    ['an X media image', 'https://pbs.twimg.com/media/a.jpg'],
  ])('gives no address for %s, so the page loads nothing third party', (_label, src) => {
    expect(avatarProxyUrl(src)).toBeUndefined()
    expect(parseImageProxyRequest('avatar', { url: src })).toEqual({ _tag: 'NotFound', reason: 'not-avatar' })
  })

  it('builds a GitHub login avatar address the route accepts', () => {
    const parsed = parseImageProxyRequest('avatar', queryOf(githubAvatarProxyUrl('antfu', 64)))
    expect(parsed).toEqual({ _tag: 'Ok', request: avatar('https://github.com/antfu.png?size=64') })
  })
})

describe('signed image addresses', () => {
  it('verifies the address it signed and rejects any other target or key', async () => {
    const key = await importImageProxyKey('primary-secret')
    const otherKey = await importImageProxyKey('other-secret')
    const path = (await signImageProxyUrl(key, 'https://img.shields.io/npm/v/skilld.svg'))!
    const parsed = parseImageProxyRequest('signed', queryOf(path))
    if (parsed._tag !== 'Ok' || parsed.request._tag !== 'signed')
      throw new Error(`expected a signed request, got ${JSON.stringify(parsed)}`)
    const { target, signature } = parsed.request

    expect(await verifyImageProxySignature(key, target, signature)).toBe(true)
    expect(await verifyImageProxySignature(key, new URL('https://img.shields.io/npm/v/other.svg'), signature)).toBe(false)
    expect(await verifyImageProxySignature(otherKey, target, signature)).toBe(false)
  })

  it('refuses to sign a private address', async () => {
    const key = await importImageProxyKey('primary-secret')
    expect(await signImageProxyUrl(key, 'https://169.254.169.254/latest')).toBeNull()
  })

  it('rejects a request with no signature', () => {
    expect(parseImageProxyRequest('signed', { url: 'https://img.shields.io/a.svg' })).toEqual({ _tag: 'NotFound', reason: 'bad-signature' })
  })
})

describe('fetchProxiedImage', () => {
  it('sends a generic user agent and no visitor headers upstream', async () => {
    const { fetcher, calls } = fakeFetch({ 'https://img.shields.io/a.svg': image('image/svg+xml') })
    const result = await fetchProxiedImage(signed('https://img.shields.io/a.svg'), fetcher)

    expect(result).toMatchObject({ _tag: 'Ok', contentType: 'image/svg+xml' })
    expect([...calls[0]!.headers.keys()].sort()).toEqual(['accept', 'user-agent'])
    expect(calls[0]!.redirect).toBe('manual')
  })

  it('follows a GitHub avatar redirect within the avatar hosts', async () => {
    const { fetcher, calls } = fakeFetch({
      'https://github.com/antfu.png?size=64': redirect('https://avatars.githubusercontent.com/u/11247099?size=64'),
      'https://avatars.githubusercontent.com/u/11247099?size=64': image('image/png'),
    })
    const result = await fetchProxiedImage(avatar('https://github.com/antfu.png?size=64'), fetcher)

    expect(result._tag).toBe('Ok')
    expect(calls).toHaveLength(2)
  })

  it('refuses an avatar redirect to another host', async () => {
    const { fetcher } = fakeFetch({ 'https://github.com/antfu.png': redirect('https://tracker.example.com/a.png') })
    expect(await fetchProxiedImage(avatar('https://github.com/antfu.png'), fetcher)).toEqual({ _tag: 'NotFound', reason: 'not-avatar' })
  })

  it('checks every redirect hop against the address rules', async () => {
    const { fetcher, calls } = fakeFetch({ 'https://badge.example.org/a': redirect('http://127.0.0.1:8080/admin') })
    expect(await fetchProxiedImage(signed('https://badge.example.org/a'), fetcher)).toEqual({ _tag: 'NotFound', reason: 'not-https' })
    expect(calls).toHaveLength(1)
  })

  it('stops after three redirects', async () => {
    const { fetcher, calls } = fakeFetch({
      'https://badge.example.org/0': redirect('/1'),
      'https://badge.example.org/1': redirect('/2'),
      'https://badge.example.org/2': redirect('/3'),
      'https://badge.example.org/3': redirect('/4'),
    })
    expect(await fetchProxiedImage(signed('https://badge.example.org/0'), fetcher)).toEqual({ _tag: 'NotFound', reason: 'redirect-limit' })
    expect(calls).toHaveLength(4)
  })

  it('rejects a response that is not an image', async () => {
    const { fetcher } = fakeFetch({ 'https://badge.example.org/a': image('text/html; charset=utf-8') })
    const result = await fetchProxiedImage(signed('https://badge.example.org/a'), fetcher)

    expect(result).toEqual({ _tag: 'UnsupportedType', contentType: 'text/html' })
    expect(imageProxyResponse(result).status).toBe(415)
  })

  it.each([
    ['declares', image('image/png', 1, { 'content-length': String(IMAGE_PROXY_MAX_BYTES + 1) })],
    ['streams', image('image/png', IMAGE_PROXY_MAX_BYTES + 1)],
  ])('rejects an image that %s more than 5 MB', async (_label, respond) => {
    const { fetcher } = fakeFetch({ 'https://badge.example.org/a': respond })
    const result = await fetchProxiedImage(signed('https://badge.example.org/a'), fetcher)

    expect(result).toEqual({ _tag: 'TooLarge' })
    expect(imageProxyResponse(result).status).toBe(413)
  })

  it('maps a missing upstream image to 404', async () => {
    const { fetcher } = fakeFetch({ 'https://badge.example.org/a': () => new Response('gone', { status: 404 }) })
    expect(imageProxyResponse(await fetchProxiedImage(signed('https://badge.example.org/a'), fetcher)).status).toBe(404)
  })
})

describe('imageProxyResponse', () => {
  it('serves an SVG sandboxed, unsniffed, cacheable, and without upstream cookies', async () => {
    const { fetcher } = fakeFetch({
      'https://img.shields.io/a.svg': image('image/svg+xml', 4, { 'set-cookie': 'track=1' }),
    })
    const response = imageProxyResponse(await fetchProxiedImage(signed('https://img.shields.io/a.svg'), fetcher))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
    expect(response.headers.get('content-security-policy')).toBe('default-src \'none\'; style-src \'unsafe-inline\'; sandbox')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toMatch(/max-age=\d{5,}/)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
