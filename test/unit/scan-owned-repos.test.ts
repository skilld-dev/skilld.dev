import type { SyncRepoStats } from '../../layers/registry/server/utils/sync-repo'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildScanOwners,
  makeOwnedRepoScanner,
  ownedRepoScanResponse,
  ownedRepoScanWarning,
  parseOrgListResponse,
} from '../../layers/identity/server/utils/scan-owned-repos'

function indexed(owner: string, repo: string, skillsUpserted = 1): SyncRepoStats {
  return {
    owner,
    repo,
    status: skillsUpserted > 0 ? 'indexed' : 'rejected',
    reason: skillsUpserted > 0 ? undefined : 'trust_inputs_insufficient',
    skillsSeen: 1,
    skillsUpserted,
    revisionsInserted: 0,
    activityEmitted: skillsUpserted > 0 ? 1 : 0,
  }
}

const noOrgs = async () => ({ _tag: 'orgs' as const, logins: [] as string[], visibility: 'public' as const })

function searchBody(overrides: Record<string, unknown> = {}) {
  return {
    total_count: 1,
    incomplete_results: false,
    items: [{
      path: 'skills/one/SKILL.md',
      repository: { name: 'skills', owner: { login: 'acme' }, fork: false },
    }],
    ...overrides,
  }
}

describe('owned GitHub repository discovery', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE discovery_candidates (
        owner TEXT NOT NULL, repo TEXT NOT NULL, source TEXT NOT NULL,
        first_discovered_at INTEGER NOT NULL, last_discovered_at INTEGER NOT NULL,
        last_attempted_at INTEGER, attempt_count INTEGER NOT NULL DEFAULT 0,
        outcome TEXT NOT NULL, rejection_reason TEXT, last_error TEXT,
        retry_state TEXT NOT NULL, next_retry_at INTEGER,
        owner_verified INTEGER NOT NULL DEFAULT 0,
        reconsideration_count INTEGER NOT NULL DEFAULT 0,
        claimed_at INTEGER,
        claim_token TEXT,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL);
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => sqlite.close())

  it('persists an unknown candidate before a failed sync without creating a skill row', async () => {
    const syncRepo = vi.fn(async (owner: string, repo: string) => ({
      ...indexed(owner, repo),
      status: 'failed' as const,
      reason: 'blob_batch_failed:502',
      skillsUpserted: 0,
    }))
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => Response.json(searchBody())),
      listOrgs: noOrgs,
      syncRepo,
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({ _tag: 'complete', reposFound: 1, reposSynced: 0, reposFailed: 1 })
    expect(sqlite.prepare(`SELECT owner, repo, outcome, retry_state, last_error FROM discovery_candidates`).get()).toEqual({
      owner: 'acme',
      repo: 'skills',
      outcome: 'retryable_failure',
      retry_state: 'retry_scheduled',
      last_error: 'blob_batch_failed:502',
    })
    expect(sqlite.prepare(`SELECT count(*) FROM skills`).pluck().get()).toBe(0)
  })

  it('does not count a zero-upsert rejection as indexed', async () => {
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => Response.json(searchBody())),
      listOrgs: noOrgs,
      syncRepo: vi.fn(async (owner, repo) => indexed(owner, repo, 0)),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({ reposSynced: 0, reposRejected: 1, reposFailed: 0 })
  })

  it('reports a stale terminal claim after sync success as a retryable candidate-state failure', async () => {
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => Response.json(searchBody())),
      listOrgs: noOrgs,
      syncRepo: vi.fn(async (owner, repo) => {
        sqlite.prepare(
          `UPDATE discovery_candidates
           SET claim_token = 'winning-claim', claimed_at = 101
           WHERE owner = ? AND repo = ? AND retry_state = 'claimed'`,
        ).run(owner, repo)
        return indexed(owner, repo)
      }),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'stale-claim',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({
      _tag: 'partial',
      reason: 'candidate_state_failure',
      reposSynced: 0,
      reposCandidateStateFailed: 1,
      reposFailed: 1,
    })
    expect(sqlite.prepare(
      `SELECT retry_state, claim_token FROM discovery_candidates`,
    ).get()).toEqual({
      retry_state: 'claimed',
      claim_token: 'winning-claim',
    })
  })

  it.each([
    [searchBody({ incomplete_results: true }), 'incomplete_results'],
    [searchBody({ total_count: 1_500 }), 'result_cap'],
  ])('returns an explicit partial result for incomplete or capped search', async (body, reason) => {
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => Response.json(body)),
      listOrgs: noOrgs,
      syncRepo: vi.fn(async (owner, repo) => indexed(owner, repo)),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({ _tag: 'partial', reason })
  })

  it('reports the exact 1,000-result pagination ceiling as partial', async () => {
    const items = Array.from({ length: 100 }, () => searchBody().items[0])
    const fetch = vi.fn(async () => Response.json(searchBody({ total_count: 1_000, items })))
    const scan = makeOwnedRepoScanner({
      fetch,
      listOrgs: noOrgs,
      syncRepo: vi.fn(async (owner, repo) => indexed(owner, repo)),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(fetch).toHaveBeenCalledTimes(10)
    expect(result).toMatchObject({ _tag: 'partial', reason: 'result_cap' })
  })

  it.each([
    [401, 'auth_failure'],
    [403, 'rate_limited'],
    [429, 'rate_limited'],
  ])('surfaces GitHub search status %i as %s', async (status, tag) => {
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => new Response(null, { status })),
      listOrgs: noOrgs,
      syncRepo: vi.fn(),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({ _tag: tag, status })
  })

  it('carries rate-limit diagnostics from GitHub response headers', async () => {
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => new Response(null, {
        listOrgs: noOrgs,
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1784770000',
          'x-github-request-id': 'REQ_123',
        },
      })),
      listOrgs: noOrgs,
      syncRepo: vi.fn(),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'secret-token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({
      _tag: 'rate_limited',
      status: 403,
      rateLimitRemaining: 0,
      rateLimitReset: 1784770000,
      requestId: 'REQ_123',
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  it('records unchanged unverified admitted candidates as already admitted', async () => {
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => Response.json(searchBody())),
      listOrgs: noOrgs,
      syncRepo: vi.fn(async (owner, repo) => ({
        ...indexed(owner, repo, 0),
        status: 'skipped-tree-sha' as const,
        reason: undefined,
      })),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(sqlite.prepare(`SELECT outcome, retry_state FROM discovery_candidates`).get()).toEqual({
      outcome: 'already_admitted',
      retry_state: 'complete',
    })
  })

  it('searches each organisation the account belongs to, not just the account', async () => {
    const fetch = vi.fn(async (url: string) => {
      const query = decodeURIComponent(new URL(url).searchParams.get('q') ?? '')
      if (query.includes('org:vue-org')) {
        return Response.json(searchBody({
          items: [{
            path: 'skills/one/SKILL.md',
            repository: { name: 'vue-ecosystem-skills', owner: { login: 'vue-org' }, fork: false },
          }],
        }))
      }
      return Response.json(searchBody())
    })
    const scan = makeOwnedRepoScanner({
      fetch: fetch as unknown as typeof globalThis.fetch,
      listOrgs: async () => ({ _tag: 'orgs', logins: ['vue-org'], visibility: 'member' }),
      syncRepo: vi.fn(async (owner, repo) => indexed(owner, repo)),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({ _tag: 'complete', orgsScanned: 1, reposFound: 2 })
    expect(sqlite.prepare(
      `SELECT owner, repo, owner_verified FROM discovery_candidates ORDER BY owner`,
    ).all()).toEqual([
      { owner: 'acme', repo: 'skills', owner_verified: 1 },
      { owner: 'vue-org', repo: 'vue-ecosystem-skills', owner_verified: 0 },
    ])
  })

  it('still scans the account when the organisation list is unavailable', async () => {
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => Response.json(searchBody())),
      listOrgs: async () => ({ _tag: 'unavailable', reason: 'org list 403' }),
      syncRepo: vi.fn(async (owner, repo) => indexed(owner, repo)),
      resolveGithubBindings: () => ({}),
      now: () => 100,
      claimToken: () => 'claim-one',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({
      _tag: 'complete',
      orgsScanned: 0,
      orgLookupError: 'org list 403',
      reposSynced: 1,
    })
  })

  it('reads organisation logins once at the boundary and drops an unusable payload', () => {
    expect(parseOrgListResponse([{ login: 'vue-org' }, { login: 'nuxt' }])).toEqual(['vue-org', 'nuxt'])
    expect(parseOrgListResponse([{ id: 1 }])).toBeNull()
    expect(parseOrgListResponse({ total_count: 1 })).toBeNull()
  })

  it('never searches the same owner twice when an organisation shares the account login', () => {
    expect(buildScanOwners('acme', ['Acme', 'vue-org'])).toEqual([
      { login: 'acme', qualifier: 'user:acme', ownerVerified: true },
      { login: 'vue-org', qualifier: 'org:vue-org', ownerVerified: false },
    ])
  })

  it('maps API success and OAuth warnings from the tagged outcome', () => {
    const complete = { _tag: 'complete' as const, ...emptyResultCounts() }
    const partial = {
      _tag: 'partial' as const,
      reason: 'incomplete_results' as const,
      ...emptyResultCounts(),
    }

    expect(ownedRepoScanResponse(complete)).toMatchObject({ ok: true, _tag: 'complete' })
    expect(ownedRepoScanResponse(partial)).toMatchObject({ ok: false, _tag: 'partial' })
    expect(ownedRepoScanWarning(complete)).toBeNull()
    expect(ownedRepoScanWarning(partial)).toEqual({
      outcome: 'partial',
      reason: 'incomplete_results',
      reposFound: 0,
      reposFailed: 0,
    })
  })

  it.each([
    ['complete', `VALUES ('acme', 'skills', 'owned_scan', 1, 1, 1, 'indexed', NULL, NULL, 'complete', NULL, 1, NULL, NULL)`, 'reposAlreadyProcessed'],
    ['exhausted', `VALUES ('acme', 'skills', 'owned_scan', 1, 1, 5, 'rejected', 'reason', NULL, 'exhausted', NULL, 1, NULL, NULL)`, 'reposExhausted'],
    ['not due', `VALUES ('acme', 'skills', 'owned_scan', 1, 1, 1, 'rejected', 'reason', NULL, 'retry_scheduled', 500, 1, NULL, NULL)`, 'reposDeferred'],
    ['active claim', `VALUES ('acme', 'skills', 'owned_scan', 1, 1, 1, 'pending', NULL, NULL, 'claimed', NULL, 1, 100, 'other')`, 'reposClaimedElsewhere'],
  ])('surfaces repeated %s candidates without false claimed-elsewhere telemetry', async (_label, values, expectedCount) => {
    sqlite.exec(`
      INSERT INTO discovery_candidates (
        owner, repo, source, first_discovered_at, last_discovered_at,
        attempt_count, outcome, rejection_reason, last_error, retry_state,
        next_retry_at, owner_verified, claimed_at, claim_token
      ) ${values};
    `)
    const syncRepo = vi.fn()
    const scan = makeOwnedRepoScanner({
      fetch: vi.fn(async () => Response.json(searchBody())),
      listOrgs: noOrgs,
      syncRepo,
      resolveGithubBindings: () => ({}),
      now: () => 200,
      claimToken: () => 'new',
    })

    const result = await scan({ login: 'acme', userToken: 'token', db, env: {} as Cloudflare.Env })

    expect(result).toMatchObject({
      [expectedCount]: 1,
      reposClaimedElsewhere: expectedCount === 'reposClaimedElsewhere' ? 1 : 0,
    })
    expect(syncRepo).not.toHaveBeenCalled()
  })
})

function emptyResultCounts() {
  return {
    hits: 0,
    ownersScanned: 0,
    orgsScanned: 0,
    orgLookupError: null,
    reposFound: 0,
    reposSynced: 0,
    reposVerifiedOnly: 0,
    reposRejected: 0,
    reposFailed: 0,
    reposClaimedElsewhere: 0,
    reposAlreadyProcessed: 0,
    reposExhausted: 0,
    reposDeferred: 0,
    reposCandidateMissing: 0,
    reposCandidateStateFailed: 0,
  }
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              const result = sqlite.prepare(sql).run(...params)
              return { meta: { changes: result.changes } }
            },
            async first<T>() {
              return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null
            },
          }
        },
      }
    },
  } as unknown as D1Database
}
