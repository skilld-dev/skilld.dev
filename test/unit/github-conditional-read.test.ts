import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGithubJson } from '../../layers/registry/server/utils/github-client'

/** A KV namespace over a Map: the ETag cache the client writes and reads. */
function memoryKv(): KVNamespace {
  const values = new Map<string, string>()
  return {
    get: async (key: string, type?: string) => {
      const value = values.get(key)
      return value === undefined ? null : type === 'json' ? JSON.parse(value) : value
    },
    put: async (key: string, value: string) => {
      values.set(key, value)
    },
  } as unknown as KVNamespace
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getGithubJson', () => {
  it('asks again with the stored ETag and answers a 304 from the cache', async () => {
    const seen: Array<{ authorization: string | null, ifNoneMatch: string | null }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      seen.push({ authorization: headers.get('authorization'), ifNoneMatch: headers.get('if-none-match') })
      return headers.get('if-none-match') === '"v1"'
        ? new Response(null, { status: 304 })
        : new Response(JSON.stringify({ login: 'nuxt', type: 'Organization' }), { status: 200, headers: { etag: '"v1"' } })
    }))
    const bindings = { GITHUB_TOKEN: 'registry-token', KV_CACHE: memoryKv() }

    await getGithubJson('/users/nuxt', bindings)
    const repeat = await getGithubJson<{ type: string }>('/users/nuxt', bindings)

    expect(repeat).toMatchObject({ status: 304, notModified: true, data: { type: 'Organization' } })
    expect(seen).toEqual([
      { authorization: 'Bearer registry-token', ifNoneMatch: null },
      { authorization: 'Bearer registry-token', ifNoneMatch: '"v1"' },
    ])
  })
})
