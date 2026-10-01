import type { EdgeCacheFetch } from '../../scripts/lib/edge-cache-check'
import { describe, expect, it } from 'vitest'
import { checkEdgeCache } from '../../scripts/lib/edge-cache-check'

const BASE = 'https://skilld.dev'

/** A payload the way Nuxt serializes it: state keys point at array slots. */
function page(session: unknown = null, authReady = false, path = '/skills/trending'): string {
  const payload = JSON.stringify([
    { state: 1 },
    { '$snuxt-session': 2, '$snuxt-auth-ready': 3 },
    session,
    authReady,
  ])
  return `<html><head><title>Trending ${path}</title><link rel="canonical" href="https://skilld.dev${path}"><script>window.__NUXT__={};window.__NUXT__.config={public:{auth:{loadStrategy:"client-only"}}}</script></head>`
    + `<body><h1>Trending</h1><script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">${payload}</script></body></html>`
}

interface Answer {
  status?: number
  headers?: Record<string, string>
  cookies?: string[]
  body?: string
}

function response(answer: Answer, path = '/skills/trending'): Response {
  const headers = new Headers({
    'content-type': 'text/html;charset=utf-8',
    'vary': 'Accept, Sec-Fetch-Dest, Host',
    ...answer.headers,
  })
  for (const cookie of answer.cookies ?? [])
    headers.append('set-cookie', cookie)
  return new Response(answer.body ?? page(null, false, path), { status: answer.status ?? 200, headers })
}

/**
 * A fake edge. Every anonymous request after the first to a path is a hit,
 * unless a test overrides one kind of request.
 */
function edge(overrides: Partial<Record<'anonymous' | 'markdown' | 'session' | 'www', (path: string, seen: number) => Answer>> = {}): EdgeCacheFetch {
  const seen = new Map<string, number>()
  return async (url, init) => {
    const { pathname, search } = new URL(url)
    const path = pathname + search
    const headers = new Headers(init.headers)
    if (new URL(url).hostname.startsWith('www.')) {
      return response(overrides.www?.(path, 0) ?? {
        status: 301,
        headers: { 'location': `${BASE}${path}`, 'cache-control': 'private, no-store', 'vary': '' },
        body: '',
      }, path)
    }
    if (headers.get('accept') === 'text/markdown') {
      return response(overrides.markdown?.(path, 0) ?? {
        status: 307,
        headers: { location: `${pathname}.md` },
        body: '',
      }, path)
    }
    if (headers.get('cookie')) {
      return response(overrides.session?.(path, 0) ?? {
        headers: { 'cf-cache-status': 'HIT' },
      }, path)
    }
    const count = (seen.get(path) ?? 0) + 1
    seen.set(path, count)
    return response(overrides.anonymous?.(path, count) ?? {
      headers: { 'cf-cache-status': count === 1 ? 'MISS' : 'HIT' },
    }, path)
  }
}

async function run(fetch: EdgeCacheFetch, paths = ['/skills/trending']) {
  return checkEdgeCache({ baseUrl: BASE, paths, fetch, wait: async () => {}, hitAttempts: 3 })
}

describe('checkEdgeCache', () => {
  it('passes when a repeat anonymous request is served from the cache', async () => {
    const result = await run(edge(), ['/skills/trending', '/skills/trending?range=all'])

    expect(result).toEqual({
      _tag: 'passed',
      checks: [
        { path: '/skills/trending', cacheStatuses: ['MISS', 'HIT'] },
        { path: '/skills/trending?range=all', cacheStatuses: ['MISS', 'HIT'] },
      ],
    })
  })

  it('expects the homepage to send Markdown readers to /index.md', async () => {
    const homeEdge = (location: string) => edge({ markdown: () => ({ status: 307, headers: { location }, body: '' }) })

    expect(await run(homeEdge('/index.md'), ['/'])).toMatchObject({ _tag: 'passed' })
    expect(await run(homeEdge('/.md'), ['/'])).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'markdown-location', path: '/', actual: '/.md' }],
    })
  })

  it('fails when two boards render one page, as a cache key that ignores the query string would', async () => {
    const paths = ['/skills/trending', '/skills/trending?range=month', '/skills/trending?range=all']
    const result = await run(edge({
      anonymous: (_path, count) => ({ body: page(null, false, '/skills/trending'), headers: { 'cf-cache-status': count === 1 ? 'MISS' : 'HIT' } }),
    }), paths)

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'shared-cache-entry', paths }],
    })
  })

  it('passes when the bare path and the default range render one board', async () => {
    const paths = ['/skills/trending', '/skills/trending?range=month', '/skills/trending?range=all']
    const result = await run(edge({
      anonymous: (path, count) => ({
        body: page(null, false, path === '/skills/trending?range=all' ? path : '/skills/trending'),
        headers: { 'cf-cache-status': count === 1 ? 'MISS' : 'HIT' },
      }),
    }), paths)

    expect(result._tag).toBe('passed')
  })

  it('retries a transient non-200 once before it fails a board', async () => {
    const inner = edge()
    let failedOnce = false
    const result = await run(async (url, init) => {
      const headers = new Headers(init.headers)
      if (!failedOnce && !headers.get('cookie') && headers.get('accept') !== 'text/markdown') {
        failedOnce = true
        return response({ status: 503 })
      }
      return inner(url, init)
    })

    expect(result._tag).toBe('passed')
  })

  it('retries a first anonymous request that times out, as a cold render after a deploy can', async () => {
    const inner = edge()
    let timedOutOnce = false
    const result = await run(async (url, init) => {
      const headers = new Headers(init.headers)
      if (!timedOutOnce && !headers.get('cookie') && headers.get('accept') !== 'text/markdown') {
        timedOutOnce = true
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
      return inner(url, init)
    })

    expect(result._tag).toBe('passed')
  })

  it('fails a board that answers non-200 twice', async () => {
    const result = await run(edge({ anonymous: () => ({ status: 503 }) }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'status', path: '/skills/trending', request: 'anonymous', expected: 200, actual: 503 }],
    })
  })

  it('gives every anonymous request an abort signal so a hung edge cannot block the job', async () => {
    const inner = edge()
    const signals: unknown[] = []
    const result = await run(async (url, init) => {
      if (!new Headers(init.headers).get('cookie') && new Headers(init.headers).get('accept') !== 'text/markdown')
        signals.push(init.signal)
      return inner(url, init)
    })

    expect(result._tag).toBe('passed')
    expect(signals.length).toBeGreaterThan(0)
    for (const signal of signals)
      expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('fails when the edge never answers from its cache', async () => {
    const result = await run(edge({ anonymous: () => ({ headers: { 'cf-cache-status': 'MISS' } }) }))

    expect(result).toEqual({
      _tag: 'failed',
      failures: [{ _tag: 'never-served-from-cache', path: '/skills/trending', cacheStatuses: ['MISS', 'MISS', 'MISS', 'MISS'] }],
    })
  })

  it('fails when an anonymous page sets any cookie', async () => {
    const result = await run(edge({
      anonymous: () => ({ headers: { 'cf-cache-status': 'MISS' }, cookies: ['__nkpv=abc; Path=/'] }),
    }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'sets-cookie', path: '/skills/trending', request: 'anonymous', cookies: ['__nkpv'] }],
    })
  })

  it.each([
    'Accept, Sec-Fetch-Dest, Host, User-Agent',
    'Accept, Sec-Fetch-Dest',
    'Accept',
    '',
  ])('fails when an anonymous page varies on %j', async (vary) => {
    const result = await run(edge({ anonymous: () => ({ headers: { vary } }) }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'vary', path: '/skills/trending', request: 'anonymous' }],
    })
  })

  it('passes when www answers a 301 to the apex after the apex entry is warm', async () => {
    const result = await run(edge())

    expect(result._tag).toBe('passed')
  })

  it('fails when www is served the stored apex page', async () => {
    const result = await run(edge({ www: () => ({ status: 200, headers: { 'cf-cache-status': 'HIT' } }) }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'www-redirect', path: '/skills/trending', status: 200, location: null }],
    })
  })

  it('fails when www redirects somewhere other than the apex path', async () => {
    const result = await run(edge({ www: () => ({ status: 301, headers: { location: 'https://www.skilld.dev/skills/trending' }, body: '' }) }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'www-redirect', status: 301, location: 'https://www.skilld.dev/skills/trending' }],
    })
  })

  it('checks www only against a real apex', async () => {
    const seen: string[] = []
    const inner = edge()
    await checkEdgeCache({
      baseUrl: 'http://localhost:5678',
      paths: ['/skills/trending'],
      fetch: async (url, init) => {
        seen.push(new URL(url).hostname)
        return inner(url, init)
      },
      wait: async () => {},
      hitAttempts: 3,
    })

    expect(seen.some(host => host.startsWith('www.'))).toBe(false)
  })

  it('fails when an agent asking for Markdown gets HTML', async () => {
    const result = await run(edge({ markdown: () => ({ status: 200 }) }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'status', path: '/skills/trending', request: 'markdown', expected: 307, actual: 200 }],
    })
  })

  it('fails when the Markdown redirect points elsewhere', async () => {
    const result = await run(edge({ markdown: () => ({ status: 307, headers: { location: '/skills.md' }, body: '' }) }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'markdown-location', path: '/skills/trending', actual: '/skills.md' }],
    })
  })

  it('fails when a request with a session cookie gets a signed-in render', async () => {
    const result = await run(edge({
      session: () => ({ body: page({ user: { login: 'someone' } }, true) }),
    }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'rendered-for-session', path: '/skills/trending' }],
    })
  })

  it('fails when a request with a session cookie is handed a new session', async () => {
    const result = await run(edge({
      session: () => ({ cookies: ['nuxt-session=Fe26.2**new; Path=/; HttpOnly'] }),
    }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'sets-cookie', path: '/skills/trending', request: 'session-cookie', cookies: ['nuxt-session'] }],
    })
  })

  it('reports a network error instead of throwing', async () => {
    const result = await run(async () => {
      throw new Error('connect ECONNREFUSED')
    })

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [
        { _tag: 'network-error', path: '/skills/trending', request: 'anonymous', message: 'connect ECONNREFUSED' },
        { _tag: 'network-error', path: '/skills/trending', request: 'markdown', message: 'connect ECONNREFUSED' },
        { _tag: 'network-error', path: '/skills/trending', request: 'session-cookie', message: 'connect ECONNREFUSED' },
        { _tag: 'www-redirect', path: '/skills/trending', status: null, message: 'connect ECONNREFUSED' },
      ],
    })
  })
})
