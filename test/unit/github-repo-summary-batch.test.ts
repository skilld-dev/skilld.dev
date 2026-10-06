import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRepoSummariesBatch } from '../../layers/registry/server/utils/github-client'

const bindings = { GITHUB_TOKEN: 'test-token' }

interface GraphqlBody {
  query: string
  variables: Record<string, string>
}

function repository(owner: string, name: string, tree: string) {
  return {
    name,
    nameWithOwner: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    owner: { login: owner },
    description: null,
    stargazerCount: 3,
    forkCount: 1,
    pushedAt: '2026-10-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    isArchived: false,
    isFork: false,
    defaultBranchRef: { name: 'main', target: { oid: 'c'.repeat(40), tree: { oid: tree } } },
  }
}

/** Answers every alias, except owners named `gone`, which GitHub reports NOT_FOUND. */
function graphqlAnswer(_input: unknown, init?: RequestInit): Response {
  const body = JSON.parse(String(init?.body)) as GraphqlBody
  const data: Record<string, unknown> = {}
  const errors: unknown[] = []
  for (const key of Object.keys(body.variables).filter(name => name.startsWith('o'))) {
    const index = key.slice(1)
    const owner = body.variables[key]!
    const name = body.variables[`n${index}`]!
    if (owner === 'gone') {
      data[`r${index}`] = null
      errors.push({ type: 'NOT_FOUND', path: [`r${index}`], message: 'Could not resolve' })
    }
    else {
      data[`r${index}`] = repository(owner, name, `tree-${owner}-${name}`)
    }
  }
  return new Response(JSON.stringify({ data, errors: errors.length ? errors : undefined }), {
    status: 200,
    headers: { 'x-ratelimit-remaining': '4990', 'x-ratelimit-resource': 'graphql' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRepoSummariesBatch', () => {
  it('reads 230 repositories in three queries, in request order', async () => {
    const fetchMock = vi.fn(graphqlAnswer)
    vi.stubGlobal('fetch', fetchMock)
    const requests = Array.from({ length: 230 }, (_, i) => ({ owner: 'acme', repo: `repo-${i}` }))

    const result = await getRepoSummariesBatch(requests, bindings)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result._tag).toBe('read')
    if (result._tag !== 'read')
      return
    expect(result.summaries).toHaveLength(230)
    expect(result.summaries[229]?.headTreeSha).toBe('tree-acme-repo-229')
    expect(result.summaries[0]?.meta.full_name).toBe('acme/repo-0')
    expect(result.rateLimit?.resource).toBe('graphql')
  })

  it('leaves a repository GitHub cannot find empty and keeps the rest', async () => {
    vi.stubGlobal('fetch', vi.fn(graphqlAnswer))

    const result = await getRepoSummariesBatch([
      { owner: 'acme', repo: 'one' },
      { owner: 'gone', repo: 'two' },
      { owner: 'acme', repo: 'three' },
    ], bindings)

    expect(result._tag === 'read' && result.summaries.map(summary => summary?.headTreeSha ?? null)).toEqual([
      'tree-acme-one',
      null,
      'tree-acme-three',
    ])
  })

  it('fails the whole batch on an error that is not NOT_FOUND', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: null,
      errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
    }), { status: 200 })))

    const result = await getRepoSummariesBatch([{ owner: 'acme', repo: 'one' }], bindings)

    expect(result).toMatchObject({ _tag: 'failed', status: 502 })
  })
})
