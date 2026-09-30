import type { EdgeCacheFetch } from '../../scripts/lib/edge-cache-check'
import { describe, expect, it } from 'vitest'
import { checkEdgeCache } from '../../scripts/lib/edge-cache-check'

const BASE = 'https://skilld.dev'

/** A payload the way Nuxt serializes it: state keys point at array slots. */
function page(session: unknown = null, authReady = false): string {
  const payload = JSON.stringify([
    { state: 1 },
    { '$snuxt-session': 2, '$snuxt-auth-ready': 3 },
    session,
    authReady,
  ])
  return `<html><head><script>window.__NUXT__={};window.__NUXT__.config={public:{auth:{loadStrategy:"client-only"}}}</script></head>`
    + `<body><h1>Trending</h1><script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">${payload}</script></body></html>`
}

interface Answer {
  status?: number
  headers?: Record<string, string>
  cookies?: string[]
  body?: string
}

function response(answer: Answer): Response {
  const headers = new Headers({
    'content-type': 'text/html;charset=utf-8',
    'vary': 'Accept, Sec-Fetch-Dest',
    ...answer.headers,
  })
  for (const cookie of answer.cookies ?? [])
    headers.append('set-cookie', cookie)
  return new Response(answer.body ?? page(), { status: answer.status ?? 200, headers })
}

/**
 * A fake edge. Every anonymous request after the first to a path is a hit,
 * unless a test overrides one kind of request.
 */
function edge(overrides: Partial<Record<'anonymous' | 'markdown' | 'session', (path: string, seen: number) => Answer>> = {}): EdgeCacheFetch {
  const seen = new Map<string, number>()
  return async (url, init) => {
    const { pathname, search } = new URL(url)
    const path = pathname + search
    const headers = new Headers(init.headers)
    if (headers.get('accept') === 'text/markdown') {
      return response(overrides.markdown?.(path, 0) ?? {
        status: 307,
        headers: { location: `${pathname}.md` },
        body: '',
      })
    }
    if (headers.get('cookie')) {
      return response(overrides.session?.(path, 0) ?? {
        headers: { 'cf-cache-status': 'HIT' },
      })
    }
    const count = (seen.get(path) ?? 0) + 1
    seen.set(path, count)
    return response(overrides.anonymous?.(path, count) ?? {
      headers: { 'cf-cache-status': count === 1 ? 'MISS' : 'HIT' },
    })
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
    'Accept, Sec-Fetch-Dest, User-Agent',
    'Accept',
    '',
  ])('fails when an anonymous page varies on %j', async (vary) => {
    const result = await run(edge({ anonymous: () => ({ headers: { vary } }) }))

    expect(result).toMatchObject({
      _tag: 'failed',
      failures: [{ _tag: 'vary', path: '/skills/trending', request: 'anonymous' }],
    })
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
      ],
    })
  })
})
