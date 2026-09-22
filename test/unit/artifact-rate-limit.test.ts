import { describe, expect, it, vi } from 'vitest'
import {
  createPublicGithubSourceClient,
  isRetryableProblem,
} from '../../layers/artifact-delivery/server/utils/github-source'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const RESET_AT = 1_790_070_000

describe('gitHub rate limits as values', () => {
  it('rejects with RATE_LIMITED and the reset time instead of throwing', async () => {
    const client = createPublicGithubSourceClient({
      fetch: vi.fn(async () => rateLimited()) as unknown as typeof fetch,
    })

    const result = await client.resolve({
      provider: 'github',
      owner: 'skilld-dev',
      repository: 'vue-ecosystem-skills',
      selector: { type: 'path', path: 'skills/vueuse-math-skilld' },
    })

    expect(result).toMatchObject({
      _tag: 'rejected',
      code: 'RATE_LIMITED',
      retryAfterSeconds: RESET_AT,
    })
  })

  it('rejects a blob read the same way, part way through a load', async () => {
    const client = createPublicGithubSourceClient({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/git/blobs/'))
          return rateLimited()
        if (url.endsWith('/repos/skilld-dev/skills'))
          return json({ id: 123, name: 'skills', owner: { login: 'skilld-dev' }, private: false, default_branch: 'main' })
        if (url.endsWith('/git/trees/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
          return json({ sha: 'a'.repeat(40), tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: 'b'.repeat(40) }] })
        if (url.endsWith('/git/trees/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'))
          return json({ sha: 'b'.repeat(40), tree: [{ path: 'demo', mode: '040000', type: 'tree', sha: 'c'.repeat(40) }] })
        if (url.endsWith('/git/trees/cccccccccccccccccccccccccccccccccccccccc?recursive=1')) {
          return json({
            sha: 'c'.repeat(40),
            truncated: false,
            tree: [{ path: 'SKILL.md', mode: '100644', type: 'blob', sha: 'd'.repeat(40), size: 12 }],
          })
        }
        return json({}, 404)
      }) as unknown as typeof fetch,
    })

    const result = await client.load({
      provider: 'github',
      repositoryId: 123,
      owner: 'skilld-dev',
      repository: 'skills',
      visibility: 'public',
      commitSha,
      treeSha: 'a'.repeat(40),
      skillPath: 'skills/demo',
    })

    expect(result).toMatchObject({ _tag: 'rejected', code: 'RATE_LIMITED', retryAfterSeconds: RESET_AT })
  })

  it('omits the reset when GitHub sends no usable header', async () => {
    const client = createPublicGithubSourceClient({
      fetch: vi.fn(async () => new Response('{}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
    })

    const result = await client.resolve({
      provider: 'github',
      owner: 'skilld-dev',
      repository: 'skills',
      selector: { type: 'path', path: 'skills/demo' },
    })

    expect(result).toMatchObject({ _tag: 'rejected', code: 'RATE_LIMITED' })
    expect(result).not.toHaveProperty('retryAfterSeconds')
  })

  it('still denies access for a 403 that is not a spent quota', async () => {
    const client = createPublicGithubSourceClient({
      fetch: vi.fn(async () => new Response('{}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '4999', 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
    })

    const result = await client.resolve({
      provider: 'github',
      owner: 'skilld-dev',
      repository: 'skills',
      selector: { type: 'path', path: 'skills/demo' },
    })

    expect(result).toMatchObject({ _tag: 'rejected', code: 'SOURCE_ACCESS_DENIED' })
  })
})

describe('which problems a caller may retry', () => {
  it.each([
    ['RATE_LIMITED', true],
    ['SOURCE_UNAVAILABLE', true],
    ['SERVICE_UNAVAILABLE', true],
    ['SIGNER_UNAVAILABLE', true],
    ['INVALID_SOURCE', false],
    ['SOURCE_NOT_FOUND', false],
    ['SOURCE_ACCESS_DENIED', false],
    ['CHECK_BLOCKED', false],
    ['ARTIFACT_REVOKED', false],
  ] as const)('reports %s as retryable=%s', (code, retryable) => {
    expect(isRetryableProblem(code)).toBe(retryable)
  })
})

function rateLimited(): Response {
  return new Response('{}', {
    status: 403,
    headers: {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(RESET_AT),
      'content-type': 'application/json',
    },
  })
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
