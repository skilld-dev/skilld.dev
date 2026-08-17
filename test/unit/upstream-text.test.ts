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
