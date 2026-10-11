import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTree } from '../../layers/registry/server/utils/github-client'

afterEach(() => vi.unstubAllGlobals())

describe('getTree', () => {
  it('reconstructs truncated trees from immutable subtree SHAs', async () => {
    const answers = new Map([
      ['root?recursive=1', { sha: 'root', truncated: true, tree: [{ path: 'partial', type: 'blob', sha: 'discard' }] }],
      ['root', { sha: 'root', tree: [{ path: 'skills', type: 'tree', sha: 'skills-tree' }] }],
      ['skills-tree?recursive=1', { sha: 'skills-tree', truncated: true, tree: [] }],
      ['skills-tree', { sha: 'skills-tree', tree: [{ path: 'one', type: 'tree', sha: 'one-tree' }] }],
      ['one-tree?recursive=1', { sha: 'one-tree', tree: [{ path: 'SKILL.md', type: 'blob', sha: 'skill', size: 120 }, { path: 'references/a.md', type: 'blob', sha: 'reference', size: 42 }] }],
    ])
    const reads: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const key = url.split('/git/trees/')[1]!
      reads.push(key)
      const answer = answers.get(key)
      if (!answer)
        throw new Error(`Unexpected tree read: ${key}`)
      return Response.json(answer)
    }))

    const result = await getTree('acme', 'large', 'root', {}, { expandTruncated: true })

    expect(result.data).toEqual({ sha: 'root', truncated: false, tree: [
      { path: 'skills', type: 'tree', sha: 'skills-tree' },
      { path: 'skills/one', type: 'tree', sha: 'one-tree' },
      { path: 'skills/one/SKILL.md', type: 'blob', sha: 'skill', size: 120 },
      { path: 'skills/one/references/a.md', type: 'blob', sha: 'reference', size: 42 },
    ] })
    expect(reads).toEqual([...answers.keys()])
  })

  it('returns a partial tree with one request unless durable refresh opts in', async () => {
    const tree = { sha: 'root', truncated: true, tree: [{ path: 'SKILL.md', type: 'blob', sha: 'skill', size: 120 }] }
    const fetchMock = vi.fn(async () => Response.json(tree))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getTree('acme', 'large', 'root', {})

    expect(result.data).toEqual(tree)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('propagates a subtree read failure without presenting a partial tree', async () => {
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      reads++
      return reads === 1
        ? Response.json({ sha: 'root', truncated: true, tree: [] })
        : new Response('', { status: 429 })
    }))

    const result = await getTree('acme', 'large', 'root', {}, { expandTruncated: true })

    expect(result.status).toBe(429)
    expect(result.data).toBeNull()
  })

  it('stops bounded traversal without accepting an incomplete inventory', async () => {
    const fetchMock = vi.fn(async (url: string) => Response.json({
      sha: url.split('/git/trees/')[1]!.split('?')[0],
      truncated: url.includes('?'),
      tree: url.includes('?') ? [] : [{ path: 'nested', type: 'tree', sha: 'next' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getTree('acme', 'large', 'root', {}, { expandTruncated: true })

    expect(result.data?.truncated).toBe(true)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(64)
  })

  it('stops expansion when long paths exceed the retained tree budget', async () => {
    const subtree = Array.from({ length: 20_000 }, (_, i) => ({
      path: `${'directory/'.repeat(50)}${i}/SKILL.md`,
      type: 'blob',
      sha: 'a'.repeat(40),
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(
      url.endsWith('root?recursive=1')
        ? { sha: 'root', truncated: true, tree: [] }
        : url.endsWith('root')
          ? { sha: 'root', tree: [{ path: 'vendor', type: 'tree', sha: 'subtree' }] }
          : { sha: 'subtree', tree: subtree },
    )))

    const result = await getTree('acme', 'large', 'root', {}, { expandTruncated: true })

    expect(result.data).toEqual({ sha: 'root', tree: [], truncated: true })
  })
})
