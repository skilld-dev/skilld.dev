import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactSigner } from '../../layers/artifact-delivery/server/utils/attestation'
import type { ArtifactBuildDependencies } from '../../layers/artifact-delivery/server/utils/build'
import type { PublicGithubSourceClient } from '../../layers/artifact-delivery/server/utils/github-source'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import { describe, expect, it, vi } from 'vitest'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import {
  createPublicGithubSourceClient,
  isRetryableProblem,
} from '../../layers/artifact-delivery/server/utils/github-source'
import { ARTIFACT_BUILD_QUEUE_NAME, consumeArtifactBuildBatch } from '../../layers/artifact-delivery/server/utils/queue'
import { createResolution, getResolution, presentResolution, resolutionRequestIdentity } from '../../layers/artifact-delivery/server/utils/state'
import { readLoadedFiles } from '../fixtures/loaded-source'
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
  'migrations/0144_artifact_resolution_requesters.sql',
  'migrations/0145_artifact_resolution_linked_files.sql',
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

  it('rejects a GitHub file read the same way, part way through a build', async () => {
    const client = createPublicGithubSourceClient({
      now: () => NOW,
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('https://raw.githubusercontent.com/'))
          return new Response(null, { status: 429, headers: { 'retry-after': '120' } })
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
        // codeload answers 404, so the build reads the file from GitHub.
        return json({}, 404)
      }) as unknown as typeof fetch,
    })

    const loaded = await client.load({
      provider: 'github',
      repositoryId: 123,
      owner: 'skilld-dev',
      repository: 'skills',
      visibility: 'public',
      commitSha,
      treeSha: 'a'.repeat(40),
      skillPath: 'skills/demo',
    }, { linkedFiles: false })
    if (loaded._tag !== 'loaded')
      throw new Error('The load needs no file bytes')

    expect(await readLoadedFiles(loaded.value)).toMatchObject({ _tag: 'rejected', code: 'RATE_LIMITED', retryAfterSeconds: NOW + 120 })
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

// GitHub answers a secondary rate limit with 403 or 429 and a Retry-After
// header, and a spent primary quota with 403 or 429 and no remaining requests.
// A 403 with Retry-After used to fail the run as SOURCE_ACCESS_DENIED, which
// nobody retries. A 429 used to throw, so the build sat through the queue
// retry ladder and spent quota on every attempt.
describe('gitHub secondary rate limits as values', () => {
  const request: SourceRequest = {
    provider: 'github',
    owner: 'skilld-dev',
    repository: 'skills',
    selector: { type: 'path', path: 'skills/demo' },
  }

  it.each([403, 429])('rejects a %i with Retry-After as RATE_LIMITED after the named delay', async (status) => {
    const client = createPublicGithubSourceClient({
      fetch: vi.fn(async () => new Response('{}', {
        status,
        headers: { 'retry-after': '30', 'x-ratelimit-remaining': '4321', 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
      now: () => NOW,
    })

    expect(await client.resolve(request)).toMatchObject({
      _tag: 'rejected',
      code: 'RATE_LIMITED',
      retryAfterSeconds: NOW + 30,
    })
  })

  it('rejects a 429 spent quota with its reset time', async () => {
    const client = createPublicGithubSourceClient({
      fetch: vi.fn(async () => new Response('{}', {
        status: 429,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET_AT), 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
    })

    expect(await client.resolve(request)).toMatchObject({
      _tag: 'rejected',
      code: 'RATE_LIMITED',
      retryAfterSeconds: RESET_AT,
    })
  })

  it('stops at a rate-limited archive instead of reading every file', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('codeload.github.com')) {
        return new Response('{}', {
          status: 429,
          headers: { 'retry-after': '60', 'content-type': 'application/json' },
        })
      }
      if (url.includes('/git/blobs/'))
        return json({ sha: 'd'.repeat(40), size: 12, encoding: 'base64', content: btoa('# Demo skill') })
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
    })
    const client = createPublicGithubSourceClient({
      fetch: fetchMock as unknown as typeof fetch,
      now: () => NOW,
    })

    const loaded = await client.load({
      provider: 'github',
      repositoryId: 123,
      owner: 'skilld-dev',
      repository: 'skills',
      visibility: 'public',
      commitSha,
      treeSha: 'a'.repeat(40),
      skillPath: 'skills/demo',
    }, { linkedFiles: false })

    if (loaded._tag !== 'loaded')
      throw new Error('The load needs no file bytes')

    expect(await readLoadedFiles(loaded.value)).toMatchObject({ _tag: 'rejected', code: 'RATE_LIMITED', retryAfterSeconds: NOW + 60 })
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('raw.githubusercontent.com'))).toBe(false)
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

describe('every retryable failure names its wait', () => {
  it('names a wait when GitHub sent no reset', async () => {
    const harness = await requestedResolution('rate-limit-no-reset-0001')
    const dependencies = buildDependencies(harness.sqlite.db, createPublicGithubSourceClient({
      fetch: vi.fn(async () => new Response('{}', { status: 429 })) as unknown as typeof fetch,
    }))

    await processArtifactBuild(dependencies, harness.id)

    const row = await getResolution(harness.sqlite.db, harness.id)
    expect(presentResolution(row!)).toMatchObject({ state: 'failed', code: 'RATE_LIMITED', retryable: true, retryAfterSeconds: 60 })
    harness.sqlite.close()
  })

  it('names a wait when the build queue gives up', async () => {
    const harness = await requestedResolution('queue-gives-up-0001')
    const message = queueMessage(harness.id, 5)

    await consumeArtifactBuildBatch({} as Cloudflare.Env, queueBatch([message]), () => buildDependencies(harness.sqlite.db, githubDown()))

    const row = await getResolution(harness.sqlite.db, harness.id)
    expect(presentResolution(row!)).toMatchObject({ state: 'failed', code: 'SERVICE_UNAVAILABLE', retryable: true, retryAfterSeconds: 60 })
    harness.sqlite.close()
  })
})

// The CLI waits 60 seconds for a Resolution. The first queue retry used to
// wait 60 seconds too, so one transient GitHub or signer error failed every
// run that met it, although the retry then built the Artifact.
describe('a failed build attempt retries inside the run deadline', () => {
  it('retries the first failed attempt within ten seconds', async () => {
    const harness = await requestedResolution('queue-first-retry-0001')
    const message = queueMessage(harness.id, 1)

    await consumeArtifactBuildBatch({} as Cloudflare.Env, queueBatch([message]), () => buildDependencies(harness.sqlite.db, githubDown()))

    expect(message.retry).toHaveBeenCalledOnce()
    expect(message.retry.mock.calls[0]![0].delaySeconds).toBeLessThanOrEqual(10)
    harness.sqlite.close()
  })
})

async function requestedResolution(idempotencyKey: string) {
  const sqlite = createSqliteD1(ARTIFACT_MIGRATIONS)
  const identity = await resolutionRequestIdentity(resolutionRequest, idempotencyKey)
  const created = await createResolution(sqlite.db, resolutionRequest, identity, NOW)
  if (created._tag === 'idempotency-conflict')
    throw new Error('Test Resolution conflicted')
  return { sqlite, id: created.row.id }
}

function buildDependencies(db: D1Database, github: PublicGithubSourceClient): ArtifactBuildDependencies {
  return {
    db,
    github,
    bucket: {} as R2Bucket,
    signer: {} as ArtifactSigner,
    trustedRoot: {} as TrustedRoot,
    now: () => NOW,
  }
}

function githubDown(): PublicGithubSourceClient {
  const fault = async () => Promise.reject(new Error('The operation was aborted due to timeout'))
  return { resolve: vi.fn(fault), load: vi.fn(fault) }
}

function queueMessage(resolutionId: string, attempts: number) {
  return {
    body: { version: 1, resolutionId },
    attempts,
    ack: vi.fn(),
    retry: vi.fn<(options: { delaySeconds: number }) => void>(),
  }
}

function queueBatch(messages: Array<ReturnType<typeof queueMessage>>) {
  return { queue: ARTIFACT_BUILD_QUEUE_NAME, messages } as unknown as Parameters<typeof consumeArtifactBuildBatch>[1]
}

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
