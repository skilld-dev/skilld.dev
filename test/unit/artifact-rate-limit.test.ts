import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactSigner } from '../../layers/artifact-delivery/server/utils/attestation'
import type { ArtifactBuildDependencies } from '../../layers/artifact-delivery/server/utils/build'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import { describe, expect, it, vi } from 'vitest'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import {
  createPublicGithubSourceClient,
  isRetryableProblem,
} from '../../layers/artifact-delivery/server/utils/github-source'
import { createResolution, resolutionRequestIdentity } from '../../layers/artifact-delivery/server/utils/state'
import { createSqliteD1 } from './helpers/d1-sqlite'

const commitSha = '0123456789abcdef0123456789abcdef01234567'
const RESET_AT = 1_790_070_000
const NOW = 1_787_227_200
const ARTIFACT_MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0112_private_artifact_keys.sql',
  'migrations/0122_artifact_resolution_retry_after.sql',
]
const resolutionRequest: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'path', path: 'skills/demo' },
}

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

describe('a spent quota persists a delay, not the reset epoch', () => {
  it('stores error_retry_after as the seconds left until the reset', async () => {
    const sqlite = createSqliteD1(ARTIFACT_MIGRATIONS)
    const identity = await resolutionRequestIdentity(resolutionRequest, 'rate-limit-delay-0001')
    const created = await createResolution(sqlite.db, resolutionRequest, identity, NOW)
    if (created._tag === 'idempotency-conflict')
      throw new Error('Test Resolution conflicted')
    const client = createPublicGithubSourceClient({
      fetch: vi.fn(async () => rateLimitedAt(NOW + 300)) as unknown as typeof fetch,
    })
    const dependencies: ArtifactBuildDependencies = {
      db: sqlite.db,
      github: client,
      bucket: {} as R2Bucket,
      signer: {} as ArtifactSigner,
      trustedRoot: {} as TrustedRoot,
      now: () => NOW,
    }

    const result = await processArtifactBuild(dependencies, created.row.id)

    expect(result).toEqual({ _tag: 'failed', resolutionId: created.row.id })
    const persisted = sqlite.raw.prepare(
      'SELECT error_retry_after FROM artifact_resolutions WHERE id = ?',
    ).get(created.row.id) as { error_retry_after: number | null }
    expect(persisted.error_retry_after).toBeGreaterThan(0)
    expect(persisted.error_retry_after).toBeLessThanOrEqual(300)
    sqlite.close()
  })
})

function rateLimited(): Response {
  return rateLimitedAt(RESET_AT)
}

function rateLimitedAt(resetAt: number): Response {
  return new Response('{}', {
    status: 403,
    headers: {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(resetAt),
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
