import { describe, expect, it, vi } from 'vitest'
import { fetchNoRedirect } from '../../layers/artifact-delivery/server/utils/fetch-no-redirect'

/**
 * workerd accepts only `follow` and `manual`. Node's undici also accepts
 * `error`, so a unit suite on Node passes while every production fetch throws
 * before it leaves the Worker. This fake carries the workerd rule.
 */
function workerdLikeFetch(respond: (url: string) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.redirect === 'error')
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"')
    return respond(String(input))
  })
}

describe('fetchNoRedirect', () => {
  it('returns the response for a 200', async () => {
    const fetch = workerdLikeFetch(() => new Response('{"ok":true}', { status: 200 }))

    const result = await fetchNoRedirect(fetch, 'https://api.github.com/repos/skilld-dev/skills', {
      headers: { Accept: 'application/json' },
    })

    expect(result._tag).toBe('ok')
    if (result._tag === 'ok')
      await expect(result.response.json()).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })

  it('reports a 302 as an unexpected redirect with its location', async () => {
    const fetch = workerdLikeFetch(() => new Response(null, {
      status: 302,
      headers: { location: 'https://github.com/elsewhere' },
    }))

    const result = await fetchNoRedirect(fetch, 'https://api.github.com/repos/skilld-dev/skills')

    expect(result).toEqual({
      _tag: 'unexpected-redirect',
      status: 302,
      location: 'https://github.com/elsewhere',
    })
  })

  it.each([301, 303, 307, 308])('treats %i as a redirect', async (status) => {
    const fetch = workerdLikeFetch(() => new Response(null, { status }))

    const result = await fetchNoRedirect(fetch, 'https://api.github.com/x')

    expect(result).toEqual({ _tag: 'unexpected-redirect', status, location: null })
  })

  it('passes a 304 through as a response, since it is not a redirect', async () => {
    const fetch = workerdLikeFetch(() => new Response(null, { status: 304 }))

    const result = await fetchNoRedirect(fetch, 'https://api.github.com/x', {
      headers: { 'If-None-Match': 'W/"etag"' },
    })

    expect(result).toMatchObject({ _tag: 'ok', response: { status: 304 } })
  })

  it('passes non-redirect error statuses through so callers keep their own mapping', async () => {
    const fetch = workerdLikeFetch(() => new Response('{}', { status: 404 }))

    const result = await fetchNoRedirect(fetch, 'https://api.github.com/x')

    expect(result).toMatchObject({ _tag: 'ok', response: { status: 404 } })
  })
})
