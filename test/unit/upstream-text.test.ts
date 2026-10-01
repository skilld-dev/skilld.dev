import { describe, expect, it, vi } from 'vitest'
import { fetchUpstreamText } from '../../layers/registry/server/utils/upstream-text'

const RAW_URL = 'https://raw.githubusercontent.com/makenotion/claude-code-notion-plugin/main/skills/notion/spec-to-implementation/SKILL.md'

function response(status: number, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response
}

describe('fetchUpstreamText', () => {
  it('returns the body once a transient upstream failure clears', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, '# Spec to implementation'))

    const result = await fetchUpstreamText(RAW_URL, { fetch, sleep: async () => {} })

    expect(result).toEqual({ _tag: 'ok', body: '# Spec to implementation' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('separates an upstream outage from a file the repository does not have', async () => {
    const fetch = vi.fn().mockResolvedValue(response(503))

    const result = await fetchUpstreamText(RAW_URL, { fetch, sleep: async () => {}, maxAttempts: 3 })

    expect(result).toEqual({ _tag: 'unavailable', status: 503, attempts: 3 })
  })

  it('does not retry a file the repository does not have', async () => {
    const fetch = vi.fn().mockResolvedValue(response(404))

    const result = await fetchUpstreamText(RAW_URL, { fetch, sleep: async () => {} })

    expect(result).toEqual({ _tag: 'missing', status: 404 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports a network failure as unavailable', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    const result = await fetchUpstreamText(RAW_URL, { fetch, sleep: async () => {}, maxAttempts: 2 })

    expect(result).toEqual({ _tag: 'unavailable', status: null, attempts: 2 })
  })

  it('stops on a status the upstream will keep refusing', async () => {
    const fetch = vi.fn().mockResolvedValue(response(451))

    const result = await fetchUpstreamText(RAW_URL, { fetch, sleep: async () => {}, maxAttempts: 3 })

    expect(result).toEqual({ _tag: 'unavailable', status: 451, attempts: 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('fetchUpstreamText timeouts', () => {
  it('aborts a hung read at the timeout and reports it as unavailable', async () => {
    const hung = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    }))
    vi.stubGlobal('fetch', hung)
    try {
      const started = Date.now()
      const result = await fetchUpstreamText(RAW_URL, { timeoutMs: 20, maxAttempts: 2, sleep: async () => {} })

      expect(result).toEqual({ _tag: 'unavailable', status: null, attempts: 2 })
      expect(Date.now() - started).toBeLessThan(2000)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('retries a body that drops part way through', async () => {
    const cut = {
      ok: true,
      status: 200,
      text: async () => {
        throw new TypeError('Network connection lost.')
      },
    } as unknown as Response
    const fetch = vi.fn()
      .mockResolvedValueOnce(cut)
      .mockResolvedValueOnce(response(200, '# Whole'))

    const result = await fetchUpstreamText(RAW_URL, { fetch, sleep: async () => {} })

    expect(result).toEqual({ _tag: 'ok', body: '# Whole' })
  })

  it('retries a Cloudflare 522', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(522))
      .mockResolvedValueOnce(response(200, 'ok'))

    expect(await fetchUpstreamText(RAW_URL, { fetch, sleep: async () => {} })).toEqual({ _tag: 'ok', body: 'ok' })
  })
})
