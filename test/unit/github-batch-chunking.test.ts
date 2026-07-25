import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBlobsBatch, getCommitsBatch, GRAPHQL_BATCH_SIZE } from '../../layers/registry/server/utils/github-client'

/**
 * Production evidence (2026-07-25): `affaan-m/everything-claude-code` has 890
 * SKILL.md files. Building one alias per file produced a 61 KB query that
 * GitHub answered with an nginx 502 after 10.8s, so the repo failed every hour
 * for days with `blob_batch_failed:502`. The same paths chunked at 50 returned
 * 200 across 18 requests. These tests pin the chunking, not the transport.
 */

function paths(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `skills/skill-${i}/SKILL.md`)
}

const bindings = { GITHUB_TOKEN: 'test-token' }

function blobResponse(request: Request | string, init?: RequestInit) {
  const body = JSON.parse(String((init as { body?: string })?.body ?? '{}')) as {
    query: string
    variables: Record<string, string>
  }
  const aliases = Object.keys(body.variables).filter(key => key.startsWith('expr'))
  const repository: Record<string, { text: string }> = {}
  for (let i = 0; i < aliases.length; i++)
    repository[`b${i}`] = { text: `contents of ${body.variables[`expr${i}`]}` }
  return new Response(JSON.stringify({ data: { repository } }), { status: 200 })
}

describe('graphQL batch chunking', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('splits a large blob batch instead of sending one oversized query', async () => {
    const fetchMock = vi.fn(blobResponse)
    vi.stubGlobal('fetch', fetchMock)

    const result = await getBlobsBatch('affaan-m', 'everything-claude-code', 'main', paths(890), bindings)

    expect(result.status).toBe(200)
    expect(result.data?.size).toBe(890)
    expect(fetchMock.mock.calls.length).toBe(Math.ceil(890 / GRAPHQL_BATCH_SIZE))
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(String((call[1] as { body: string }).body)) as { query: string }
      // The 61 KB single query is what GitHub 502'd on.
      expect(body.query.length).toBeLessThan(20_000)
    }
  })

  it('surfaces the upstream status when one chunk fails rather than returning partial data', async () => {
    let call = 0
    vi.stubGlobal('fetch', vi.fn((input: Request | string, init?: RequestInit) => {
      call += 1
      if (call === 2)
        return new Response('<html><head><title>502 Bad Gateway</title></head></html>', { status: 502 })
      return blobResponse(input, init)
    }))

    const result = await getBlobsBatch('affaan-m', 'everything-claude-code', 'main', paths(200), bindings)

    expect(result.status).toBe(502)
    expect(result.data).toBeNull()
  })

  it('does not throw when GitHub answers 200 with a body that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('', { status: 200 })))

    const result = await getBlobsBatch('owner', 'repo', 'main', paths(1), bindings)

    expect(result.data).toBeNull()
    expect(result.status).toBeGreaterThanOrEqual(500)
  })

  it('chunks commit history batches on the same boundary', async () => {
    const fetchMock = vi.fn((input: Request | string, init?: RequestInit) => {
      const body = JSON.parse(String((init as { body?: string })?.body ?? '{}')) as {
        variables: Record<string, string>
      }
      const count = Object.keys(body.variables).filter(key => key.startsWith('path')).length
      const target: Record<string, { nodes: [] }> = {}
      for (let i = 0; i < count; i++)
        target[`h${i}`] = { nodes: [] }
      return new Response(
        JSON.stringify({ data: { repository: { defaultBranchRef: { target } } } }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getCommitsBatch('owner', 'repo', paths(120), 5, bindings)

    expect(result.status).toBe(200)
    expect(result.data?.size).toBe(120)
    expect(fetchMock.mock.calls.length).toBe(Math.ceil(120 / GRAPHQL_BATCH_SIZE))
  })

  it('sends a single request when the batch already fits', async () => {
    const fetchMock = vi.fn(blobResponse)
    vi.stubGlobal('fetch', fetchMock)

    await getBlobsBatch('owner', 'repo', 'main', paths(10), bindings)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
