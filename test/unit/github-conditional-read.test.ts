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

const treePath = '/repos/nuxt/nuxt/git/trees/main?recursive=1'
const treeKey = `gh-etag:https://api.github.com${treePath}`
const treeBody = {
  sha: 'a'.repeat(40),
  truncated: false,
  tree: Array.from({ length: 500 }, (_, index) => ({
    path: `fixtures/registry/skills/example-${index}/SKILL.md`,
    sha: 'b'.repeat(40),
    type: 'blob',
  })),
}
const treeEtag = '"fixture-tree"'

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

  it('stores a smaller tree payload with the same expiry and returns it unchanged on 304', async () => {
    const kv = memoryKv()
    const get = vi.spyOn(kv, 'get')
    const put = vi.spyOn(kv, 'put')
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const conditional = new Headers(init.headers).get('if-none-match')
      return conditional === treeEtag
        ? new Response(null, { status: 304 })
        : Response.json(treeBody, { headers: { etag: treeEtag } })
    })
    const bindings = { GITHUB_TOKEN: 'registry-token', KV_CACHE: kv }

    await expect(getGithubJson(treePath, bindings)).resolves.toMatchObject({ status: 200, data: treeBody })
    await expect(getGithubJson(treePath, bindings)).resolves.toMatchObject({ status: 304, notModified: true, data: treeBody })

    expect(get.mock.calls).toEqual([[treeKey, 'json'], [treeKey, 'json']])
    expect(put).toHaveBeenCalledOnce()
    const [key, stored, options] = put.mock.calls[0]!
    expect(key).toBe(treeKey)
    expect(options).toEqual({ expirationTtl: 7 * 24 * 60 * 60 })
    expect(typeof stored).toBe('string')
    expect(String(stored).length).toBeLessThan(JSON.stringify({ etag: treeEtag, body: treeBody }).length / 2)
    expect(JSON.parse(String(stored))).not.toHaveProperty('etag')
    expect(JSON.parse(String(stored))).not.toHaveProperty('body')
  })

  it('reads a legacy tree entry on 304 without rewriting it', async () => {
    const kv = memoryKv()
    await kv.put(treeKey, JSON.stringify({ etag: treeEtag, body: treeBody }))
    const put = vi.spyOn(kv, 'put')
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('if-none-match')).toBe(treeEtag)
      return new Response(null, { status: 304 })
    })

    const result = await getGithubJson(treePath, { GITHUB_TOKEN: 'registry-token', KV_CACHE: kv })
    expect(result).toMatchObject({ status: 304, notModified: true, data: treeBody })
    expect(put).not.toHaveBeenCalled()
  })

  it.each([
    { path: '/users/nuxt', body: treeBody },
    { path: treePath, body: { tree: [] } },
    { path: treePath, body: { oversized: 'x'.repeat(4 * 1024 * 1024) } },
  ])('stores plain JSON for an ineligible $path response', async ({ path, body }) => {
    const kv = memoryKv()
    vi.stubGlobal('fetch', async () => Response.json(body, { headers: { etag: treeEtag } }))

    await getGithubJson(path, { GITHUB_TOKEN: 'registry-token', KV_CACHE: kv })

    expect(await kv.get(`gh-etag:https://api.github.com${path}`)).toBe(JSON.stringify({ etag: treeEtag, body }))
  })

  it.each([
    { data: 'bm90IGd6aXA=' },
    { bytes: 16 * 1024 },
  ])('refetches a tree unconditionally when its compressed cache entry is corrupt', async (corruption) => {
    const kv = memoryKv()
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      return new Headers(init.headers).has('if-none-match')
        ? new Response(null, { status: 304 })
        : Response.json(treeBody, { headers: { etag: treeEtag } })
    })
    vi.stubGlobal('fetch', fetch)
    const bindings = { GITHUB_TOKEN: 'registry-token', KV_CACHE: kv }
    await getGithubJson(treePath, bindings)
    const envelope = await kv.get<Record<string, unknown>>(treeKey, 'json')
    await kv.put(treeKey, JSON.stringify({ ...envelope, ...corruption }))

    await expect(getGithubJson(treePath, bindings)).resolves.toMatchObject({ status: 200, data: treeBody })
    expect(new Headers(fetch.mock.calls[1]?.[1].headers).has('if-none-match')).toBe(false)
  })
})
