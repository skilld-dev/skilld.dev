import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactSigner } from '../../layers/artifact-delivery/server/utils/attestation'
import type { ArtifactBuildDependencies } from '../../layers/artifact-delivery/server/utils/build'
import type { PublicGithubSourceClient, SourceRejection } from '../../layers/artifact-delivery/server/utils/github-source'
import type { TrustedRoot } from '../../layers/artifact-delivery/server/utils/trusted-root'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { ARTIFACT_BUILD_QUEUE_NAME, consumeArtifactBuildBatch } from '../../layers/artifact-delivery/server/utils/queue'
import { requestResolution } from '../../layers/artifact-delivery/server/utils/request-resolution'
import { createRequesterGithubSource } from '../../layers/artifact-delivery/server/utils/requester-github'
import { getResolution } from '../../layers/artifact-delivery/server/utils/state'
import { encryptToken } from '../../layers/identity/server/utils/crypto'
import { purgeRetainedPersonalData } from '../../layers/identity/server/utils/data-retention'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// The shared GitHub buckets run out each hour. A signed-in run can still read
// GitHub with its own account's token, which has its own quota, for its own
// build only.
const NOW = 1_791_300_000
const RESET_AT = NOW + 600
const TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
const ALICE = 9101
const BOB = 9102
const request: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'path', path: 'skills/demo' },
}

describe('a signed-in run when the shared GitHub credential is rate limited', () => {
  let fixture: ReturnType<typeof createSqliteD1>

  beforeEach(async () => {
    fixture = createSqliteD1(allMigrations())
    const insert = fixture.raw.prepare(
      `INSERT INTO users (id, github_id, login, github_token_encrypted, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    insert.run(ALICE, 900_001, 'alice', await encryptToken('gho_alice', TOKEN_KEY), NOW, NOW)
    insert.run(BOB, 900_002, 'bob', await encryptToken('gho_bob', TOKEN_KEY), NOW, NOW)
  })

  afterEach(() => fixture.close())

  it('reads GitHub with the requester\'s own token', async () => {
    const github = userGithub()
    const id = await requested('alice-run-0000001', ALICE)

    await processArtifactBuild(dependencies(github), id)

    expect(github.authorizations).toContain('Bearer gho_alice')
    expect(github.authorizations).not.toContain('Bearer gho_bob')
    // The requester's read reached GitHub, which has no such Repository.
    expect(await getResolution(fixture.db, id)).toMatchObject({ state: 'failed', error_code: 'SOURCE_NOT_FOUND' })
  })

  it('keeps RATE_LIMITED for an anonymous run, and reads with no user token', async () => {
    const github = userGithub()
    const id = await requested('anonymous-run-001', null)

    await processArtifactBuild(dependencies(github), id)

    expect(github.authorizations).toEqual([])
    expect(await getResolution(fixture.db, id)).toMatchObject({ state: 'failed', error_code: 'RATE_LIMITED' })
  })

  it('never reads one user\'s build with another user\'s token', async () => {
    const github = userGithub()
    await requested('alice-run-0000002', ALICE)
    const bobRun = await requested('bob-run-000000001', BOB)
    const anonymousRun = await requested('anonymous-run-002', null)

    await processArtifactBuild(dependencies(github), bobRun)
    await processArtifactBuild(dependencies(github), anonymousRun)

    expect(github.authorizations.length).toBeGreaterThan(0)
    expect(github.authorizations.every(value => value === 'Bearer gho_bob')).toBe(true)
  })

  it('keeps the shared credential while it has quota', async () => {
    const github = userGithub()
    const shared = sharedGithub({ code: 'SOURCE_NOT_FOUND' })
    const id = await requested('alice-run-0000003', ALICE)

    await processArtifactBuild(dependencies(github, shared), id)

    expect(github.authorizations).toEqual([])
    expect(shared.resolve).toHaveBeenCalledOnce()
  })

  it('reports RATE_LIMITED when the requester has no stored GitHub token', async () => {
    fixture.raw.prepare(`UPDATE users SET github_token_encrypted = NULL WHERE id = ?`).run(ALICE)
    const github = userGithub()
    const id = await requested('alice-run-0000004', ALICE)

    await processArtifactBuild(dependencies(github), id)

    expect(github.authorizations).toEqual([])
    expect(await getResolution(fixture.db, id)).toMatchObject({ state: 'failed', error_code: 'RATE_LIMITED' })
  })

  it('forgets who asked once the build settles', async () => {
    const github = userGithub()
    const id = await requested('alice-run-0000005', ALICE)
    const message = { id: 'message-1', attempts: 1, body: { version: 1, resolutionId: id }, ack: vi.fn(), retry: vi.fn() }

    await consumeArtifactBuildBatch(
      {} as Cloudflare.Env,
      { queue: ARTIFACT_BUILD_QUEUE_NAME, messages: [message] } as unknown as Parameters<typeof consumeArtifactBuildBatch>[1],
      () => dependencies(github),
    )

    expect(message.ack).toHaveBeenCalledOnce()
    expect(requesters()).toEqual([])
  })

  it('purges a requester a dead build left behind after a day', async () => {
    const stale = await requested('alice-run-0000006', ALICE)
    fixture.raw.prepare(`UPDATE artifact_resolution_requesters SET created_at = ? WHERE resolution_id = ?`).run(NOW - 86_401, stale)
    const fresh = await requested('alice-run-0000007', ALICE)

    await purgeRetainedPersonalData(fixture.db, NOW)

    expect(requesters()).toEqual([fresh])
  })

  function requesters(): unknown[] {
    return fixture.raw.prepare(`SELECT resolution_id FROM artifact_resolution_requesters`).all().map(row => Object.values(row)[0])
  }

  async function requested(idempotencyKey: string, requesterAccountId: number | null): Promise<string> {
    const result = await requestResolution({
      db: fixture.db,
      lookupAdmitted: async () => null,
      enqueue: async () => {},
      now: () => NOW,
    }, { source: request, idempotencyKey, access: { visibility: 'public' }, requesterAccountId })
    if (result._tag === 'idempotency-conflict')
      throw new Error('Test Resolution conflicted')
    return result.row.id
  }

  function dependencies(github: UserGithub, shared: PublicGithubSourceClient = sharedGithub({ code: 'RATE_LIMITED' })): ArtifactBuildDependencies {
    return {
      db: fixture.db,
      github: shared,
      requesterGithub: createRequesterGithubSource({ db: fixture.db, tokenKey: () => TOKEN_KEY, fetch: github.fetch, now: () => NOW }),
      bucket: {} as R2Bucket,
      signer: {} as ArtifactSigner,
      trustedRoot: {} as TrustedRoot,
      now: () => NOW,
    }
  }
})

function sharedGithub(rejection: { code: SourceRejection['code'] }): PublicGithubSourceClient & { resolve: ReturnType<typeof vi.fn> } {
  const rejected: SourceRejection = rejection.code === 'RATE_LIMITED'
    ? { _tag: 'rejected', code: 'RATE_LIMITED', summary: 'GitHub refused the read: its rate limit is spent.', findings: [], retryAfterSeconds: RESET_AT }
    : { _tag: 'rejected', code: rejection.code, summary: 'The Repository was not found.', findings: [] }
  return { resolve: vi.fn(async () => rejected), load: vi.fn(async () => rejected) }
}

interface UserGithub {
  fetch: typeof fetch
  authorizations: Array<string | null>
}

/** GitHub as a user token sees it: it has quota, and no such Repository. */
function userGithub(): UserGithub {
  const authorizations: UserGithub['authorizations'] = []
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    authorizations.push(new Headers(init?.headers).get('authorization'))
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }
  return { fetch: fetcher as typeof fetch, authorizations }
}
