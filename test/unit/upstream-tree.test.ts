import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SOURCE = { owner: 'dimillian', repo: 'skills' }
const TREE_URL = 'https://ungh.cc/repos/dimillian/skills/files/main'

/** ofetch rejects with the status on the error, and again under `response`. */
function unghError(status: number) {
  return Object.assign(new Error(`${status} upstream`), {
    status,
    statusCode: status,
    response: { status },
  })
}

const TREE = { files: [{ path: 'app-store-changelog/SKILL.md', size: 120 }] }

/**
 * The util reads `$fetch` through a Nuxt auto-import, so the stub only lands
 * on a module imported after the registry is reset.
 */
async function load() {
  return (await import('../../layers/registry/server/utils/upstream-tree')).fetchUpstreamTree
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('createWideEvent', () => ({ context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }))
  vi.stubGlobal('emitOperationalEvent', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchUpstreamTree', () => {
  it('returns the tree once a transient ungh failure clears', async () => {
    // SKILLD-1E: dimillian/skills was live and serving throughout the window,
    // and the endpoint still answered 503. One ungh blip became a hard outage
    // because the tree read had no retry, unlike the content read.
    const $fetch = vi.fn()
      .mockRejectedValueOnce(unghError(503))
      .mockResolvedValueOnce(TREE)
    vi.stubGlobal('$fetch', $fetch)

    const result = await (await load())(SOURCE, 'main', { operation: 'test', sleep: async () => {} })

    expect(result).toEqual({ _tag: 'available', files: [{ path: 'app-store-changelog/SKILL.md', size: 120 }] })
    expect($fetch.mock.calls.map(([url]) => String(url))).toEqual([TREE_URL, TREE_URL])
  })

  it('retries a connection that never answers', async () => {
    const $fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(TREE)
    vi.stubGlobal('$fetch', $fetch)

    const result = await (await load())(SOURCE, 'main', { operation: 'test', sleep: async () => {} })

    expect(result).toEqual({ _tag: 'available', files: [{ path: 'app-store-changelog/SKILL.md', size: 120 }] })
    expect($fetch).toHaveBeenCalledTimes(2)
  })

  it('reports a sustained outage as unavailable after the last attempt', async () => {
    const $fetch = vi.fn().mockRejectedValue(unghError(503))
    vi.stubGlobal('$fetch', $fetch)

    const result = await (await load())(SOURCE, 'main', { operation: 'test', sleep: async () => {}, maxAttempts: 3 })

    expect(result).toEqual({ _tag: 'unavailable' })
    expect($fetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry a repository that is gone', async () => {
    // dagster-io/erk: deleted upstream. A retry cannot bring it back, and 410
    // is the answer the page tombstone already gives.
    const $fetch = vi.fn().mockRejectedValue(unghError(404))
    vi.stubGlobal('$fetch', $fetch)

    const result = await (await load())(SOURCE, 'main', { operation: 'test', sleep: async () => {} })

    expect(result).toEqual({ _tag: 'gone' })
    expect($fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry a status the upstream will keep refusing', async () => {
    const $fetch = vi.fn().mockRejectedValue(unghError(451))
    vi.stubGlobal('$fetch', $fetch)

    const result = await (await load())(SOURCE, 'main', { operation: 'test', sleep: async () => {} })

    expect(result).toEqual({ _tag: 'unavailable' })
    expect($fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps only the entries that carry a path', async () => {
    // ungh is a third party. Parse its body at the boundary rather than
    // trusting the declared type inward.
    const $fetch = vi.fn().mockResolvedValue({
      files: [{ path: 'a/SKILL.md', size: 10 }, { size: 4 }, null, { path: 12 }],
    })
    vi.stubGlobal('$fetch', $fetch)

    const result = await (await load())(SOURCE, 'main', { operation: 'test', sleep: async () => {} })

    expect(result).toEqual({ _tag: 'available', files: [{ path: 'a/SKILL.md', size: 10 }] })
  })

  it('reports a body that is not a tree as unavailable', async () => {
    const $fetch = vi.fn().mockResolvedValue('<html>maintenance</html>')
    vi.stubGlobal('$fetch', $fetch)

    const result = await (await load())(SOURCE, 'main', { operation: 'test', sleep: async () => {} })

    expect(result).toEqual({ _tag: 'unavailable' })
  })
})
