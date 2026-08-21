// @vitest-environment node
import type {
  GithubUpdatePlansDependencies,
  UpdatePlansCache,
} from '../../layers/artifact-delivery/server/utils/update-plans'
import { describe, expect, it, vi } from 'vitest'
import { updatePlansRequestSchema } from '../../layers/artifact-delivery/server/schemas/update-plans'
import { createGithubUpdatePlans } from '../../layers/artifact-delivery/server/utils/update-plans'

const BASE_SHA = 'a'.repeat(40)
const HEAD_SHA = 'b'.repeat(40)
const NOW = Date.parse('2026-08-21T00:00:00Z')

const comparison = {
  id: 'grill',
  owner: 'acme',
  repository: 'private-skills',
  baseSha: BASE_SHA,
  headSha: HEAD_SHA,
}

describe('github update plans', () => {
  it('accepts at most 50 exact commit comparisons', () => {
    expect(updatePlansRequestSchema.safeParse({
      comparisons: [{ ...comparison, baseSha: 'main' }],
    }).success).toBe(false)
    expect(updatePlansRequestSchema.safeParse({
      comparisons: [comparison, { ...comparison, repository: 'other-skills' }],
    }).success).toBe(false)
    expect(updatePlansRequestSchema.safeParse({
      comparisons: Array.from({ length: 51 }, (_, index) => ({
        ...comparison,
        id: `skill-${index}`,
      })),
    }).success).toBe(false)
  })

  it('returns an exact relation and sanitized commit details', async () => {
    const harness = createHarness({
      fetch: vi.fn(async (_input, init) => {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer installation-secret')
        return githubResponse({
          status: 'ahead',
          total_commits: 1,
          commits: [githubCommit('c'.repeat(40), 'Add grill\u001B[31m support\r\nHidden detail')],
        })
      }),
    })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{
      _tag: 'ready',
      ...comparison,
      relation: 'ahead',
      total: 1,
      truncated: false,
      compareUrl: `https://github.com/acme/private-skills/compare/${BASE_SHA}...${HEAD_SHA}`,
      commits: [{
        sha: 'c'.repeat(40),
        subject: 'Add grill [31m support',
        timestamp: '2026-08-20T23:00:00Z',
        author: { name: 'Ada Lovelace', login: 'ada' },
      }],
    }])
    expect(JSON.stringify(result)).not.toContain('installation-secret')
    expect(JSON.stringify(result)).not.toContain('user-secret')
    expect(harness.userCanAccessRepository).toHaveBeenCalledWith('user-secret', 9001, 7001)
    expect(harness.createRepositoryToken).toHaveBeenCalledWith(9001, 7001)
  })

  it('fails closed when the account or installation lost Repository access', async () => {
    const harness = createHarness({
      findAccess: vi.fn(async () => ({ _tag: 'not-found' as const })),
    })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{ _tag: 'not_found', ...comparison }])
    expect(harness.userCanAccessRepository).not.toHaveBeenCalled()
    expect(harness.createRepositoryToken).not.toHaveBeenCalled()
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('rechecks live installation scope before issuing a Repository token', async () => {
    const userCanAccessRepository = vi.fn(async () => false)
    const harness = createHarness({
      githubApp: {
        userCanAccessRepository,
        createRepositoryToken: vi.fn(async () => ({ _tag: 'not-found' as const })),
      },
    })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{ _tag: 'not_found', ...comparison }])
    expect(userCanAccessRepository).toHaveBeenCalledWith('user-secret', 9001, 7001)
    expect(harness.createRepositoryToken).not.toHaveBeenCalled()
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('returns one result per item when only part of a batch is accessible', async () => {
    const hidden = { ...comparison, id: 'hidden', repository: 'hidden-skills' }
    const harness = createHarness({
      findAccess: vi.fn(async (_owner, repository) => repository === comparison.repository
        ? {
            _tag: 'allowed' as const,
            accountId: 1,
            installationId: 9001,
            repositoryId: 7001,
            owner: 'acme',
            repository: 'private-skills',
          }
        : { _tag: 'not-found' as const }),
    })

    const result = await createGithubUpdatePlans([comparison, hidden], harness.dependencies)

    expect(result.map(item => item._tag)).toEqual(['ready', 'not_found'])
    expect(result.map(item => item.id)).toEqual(['grill', 'hidden'])
    expect(harness.fetch).toHaveBeenCalledOnce()
  })

  it('deduplicates an exact range without losing item identities', async () => {
    const duplicate = { ...comparison, id: 'grill-copy' }
    const findAccess = vi.fn(async () => ({
      _tag: 'allowed' as const,
      accountId: 1,
      installationId: 9001,
      repositoryId: 7001,
      owner: 'acme',
      repository: 'private-skills',
    }))
    const harness = createHarness({ findAccess })

    const result = await createGithubUpdatePlans([comparison, duplicate], harness.dependencies)

    expect(result.map(item => item.id)).toEqual(['grill', 'grill-copy'])
    expect(result.every(item => item._tag === 'ready')).toBe(true)
    expect(findAccess).toHaveBeenCalledOnce()
    expect(harness.createRepositoryToken).toHaveBeenCalledOnce()
    expect(harness.fetch).toHaveBeenCalledOnce()
  })

  it('caps each comparison at 500 commits', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      const offset = (page - 1) * 100
      const count = page === 6 ? 50 : 100
      return githubResponse({
        status: 'ahead',
        total_commits: 550,
        commits: Array.from({ length: count }, (_, index) => githubCommit(
          (offset + index + 1).toString(16).padStart(40, '0'),
          `Commit ${offset + index + 1}`,
        )),
      })
    })
    const harness = createHarness({ fetch: fetchMock })

    const [result] = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result?._tag).toBe('ready')
    if (result?._tag !== 'ready')
      throw new Error('Expected a ready update plan')
    expect(result.commits).toHaveLength(500)
    expect(result.commits[0]?.sha).toBe((51).toString(16).padStart(40, '0'))
    expect(result.commits.at(-1)?.sha).toBe((550).toString(16).padStart(40, '0'))
    expect(result.total).toBe(550)
    expect(result.truncated).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('rejects an incomplete paginated comparison', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      return githubResponse({
        status: 'ahead',
        total_commits: 101,
        commits: page === 1
          ? Array.from({ length: 100 }, (_, index) => githubCommit(
              (index + 1).toString(16).padStart(40, '0'),
              `Commit ${index + 1}`,
            ))
          : [],
      })
    })
    const harness = createHarness({ fetch: fetchMock })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{
      _tag: 'provider_failure',
      ...comparison,
      status: 502,
    }])
  })

  it('rejects duplicate commits in a paginated comparison', async () => {
    const duplicate = githubCommit('c'.repeat(40), 'Repeated commit')
    const harness = createHarness({
      fetch: vi.fn(async () => githubResponse({
        status: 'ahead',
        total_commits: 2,
        commits: [duplicate, duplicate],
      })),
    })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{
      _tag: 'provider_failure',
      ...comparison,
      status: 502,
    }])
  })

  it('serves a fresh cache hit and revalidates stale data with ETag', async () => {
    let now = NOW
    const cache = memoryCache()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const etag = new Headers(init?.headers).get('if-none-match')
      if (etag === 'W/"compare-v1"')
        return new Response(null, { status: 304 })
      return githubResponse({
        status: 'ahead',
        total_commits: 1,
        commits: [githubCommit('c'.repeat(40), 'Cached commit')],
      }, { etag: 'W/"compare-v1"' })
    })
    const harness = createHarness({ fetch: fetchMock, cache, now: () => now })

    const first = await createGithubUpdatePlans([comparison], harness.dependencies)
    const fresh = await createGithubUpdatePlans([comparison], harness.dependencies)
    now += 301_000
    const revalidated = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(first).toEqual(fresh)
    expect(revalidated).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('if-none-match')).toBe('W/"compare-v1"')
  })

  it('returns bounded rate limit details from GitHub', async () => {
    const harness = createHarness({
      fetch: vi.fn(async () => new Response('slow down', {
        status: 429,
        headers: {
          'retry-after': '12',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1787271000',
        },
      })),
    })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{
      _tag: 'rate_limited',
      ...comparison,
      retryAfterSeconds: 12,
      resetAt: '2026-08-21T00:10:00.000Z',
    }])
  })

  it('honours an HTTP date Retry-After without inventing a reset time', async () => {
    const harness = createHarness({
      fetch: vi.fn(async () => new Response('slow down', {
        status: 429,
        headers: { 'retry-after': new Date(NOW + 5_000).toUTCString() },
      })),
    })

    const [result] = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toMatchObject({
      _tag: 'rate_limited',
      retryAfterSeconds: 5,
      resetAt: null,
    })
  })

  it.each([401, 403])('keeps GitHub token failures distinct from missing access for %i', async (status) => {
    const harness = createHarness({
      fetch: vi.fn(async () => new Response(null, { status })),
    })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{
      _tag: 'provider_failure',
      ...comparison,
      status,
    }])
  })

  it('cancels a provider failure body', async () => {
    const cancel = vi.fn()
    const harness = createHarness({
      fetch: vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 503 })),
    })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{
      _tag: 'provider_failure',
      ...comparison,
      status: 503,
    }])
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('ignores a cached ETag that cannot be sent as an HTTP header', async () => {
    const cache: UpdatePlansCache = {
      async get() {
        return {
          version: 1,
          etag: 'bad\nheader',
          checkedAt: NOW - 301_000,
          value: {
            relation: 'identical',
            commits: [],
            total: 0,
            truncated: false,
            compareUrl: `https://github.com/acme/private-skills/compare/${BASE_SHA}...${HEAD_SHA}`,
          },
        }
      },
      async put() {},
    }
    const harness = createHarness({ cache })

    const result = await createGithubUpdatePlans([comparison], harness.dependencies)

    expect(result).toEqual([{
      _tag: 'ready',
      ...comparison,
      relation: 'identical',
      commits: [],
      total: 0,
      truncated: false,
      compareUrl: `https://github.com/acme/private-skills/compare/${BASE_SHA}...${HEAD_SHA}`,
    }])
    expect(harness.fetch).toHaveBeenCalledOnce()
    expect(harness.dependencies.reportFailure).toHaveBeenCalledWith('cache-read')
  })
})

function createHarness(overrides: Partial<GithubUpdatePlansDependencies> = {}) {
  const fetchMock = overrides.fetch ?? vi.fn(async () => githubResponse({
    status: 'identical',
    total_commits: 0,
    commits: [],
  }))
  const userCanAccessRepository = overrides.githubApp?.userCanAccessRepository
    ?? vi.fn(async () => true)
  const createRepositoryToken = overrides.githubApp?.createRepositoryToken
    ?? vi.fn(async () => ({
      _tag: 'created' as const,
      token: 'installation-secret',
      expiresAt: '2026-08-21T01:00:00Z',
    }))
  const dependencies: GithubUpdatePlansDependencies = {
    findAccess: async () => ({
      _tag: 'allowed',
      accountId: 1,
      installationId: 9001,
      repositoryId: 7001,
      owner: 'acme',
      repository: 'private-skills',
    }),
    loadUserToken: async () => 'user-secret',
    githubApp: { userCanAccessRepository, createRepositoryToken },
    fetch: fetchMock,
    now: () => NOW,
    reportFailure: vi.fn(),
    ...overrides,
  }
  return {
    dependencies,
    fetch: fetchMock,
    userCanAccessRepository,
    createRepositoryToken,
  }
}

function githubCommit(sha: string, message: string) {
  return {
    sha,
    commit: {
      message,
      author: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        date: '2026-08-20T23:00:00Z',
      },
    },
    author: { login: 'ada' },
  }
}

function githubResponse(
  body: { status: string, total_commits: number, commits: unknown[] },
  headers: HeadersInit = {},
) {
  return Response.json(body, { headers })
}

function memoryCache(): UpdatePlansCache {
  const values = new Map<string, string>()
  return {
    async get(key: string, type: 'json') {
      expect(type).toBe('json')
      const value = values.get(key)
      return value ? JSON.parse(value) as unknown : null
    },
    async put(key: string, value: string, _options: { expirationTtl: number }) {
      values.set(key, value)
    },
  }
}
