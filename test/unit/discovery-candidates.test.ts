import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  claimDiscoveryCandidate,
  classifyDiscoveryClaimUnavailable,
  discoveryOutcomeFromSyncStats,
  finishDiscoveryCandidateAttempt,
  upsertDiscoveryCandidate,
} from '../../layers/registry/server/utils/discovery-candidates'

describe('durable discovery candidates', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE discovery_candidates (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        source TEXT NOT NULL,
        first_discovered_at INTEGER NOT NULL,
        last_discovered_at INTEGER NOT NULL,
        last_attempted_at INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        outcome TEXT NOT NULL,
        rejection_reason TEXT,
        last_error TEXT,
        retry_state TEXT NOT NULL,
        next_retry_at INTEGER,
        owner_verified INTEGER NOT NULL DEFAULT 0,
        reconsideration_count INTEGER NOT NULL DEFAULT 0,
        claimed_at INTEGER,
        claim_token TEXT,
        PRIMARY KEY (owner, repo)
      );
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => sqlite.close())

  it('persists an unknown repo independently of skills', async () => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'new-skills',
      source: 'owned_scan',
      discoveredAt: 100,
      ownerVerified: true,
    })

    expect(sqlite.prepare(`SELECT * FROM discovery_candidates`).get()).toMatchObject({
      owner: 'acme',
      repo: 'new-skills',
      source: 'owned_scan',
      first_discovered_at: 100,
      last_discovered_at: 100,
      outcome: 'pending',
      retry_state: 'ready',
      owner_verified: 1,
    })
  })

  it('lets a rejected candidate graduate after verified trust is rediscovered', async () => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      source: 'github_search',
      discoveredAt: 100,
      ownerVerified: false,
    })
    const firstClaim = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 101,
      staleBefore: 1,
      token: 'first',
    })
    expect(firstClaim?._tag).toBe('claimed')
    await finishDiscoveryCandidateAttempt(db, {
      owner: 'acme',
      repo: 'skills',
      token: 'first',
      now: 102,
      outcome: { _tag: 'rejected', reason: 'trust_inputs_insufficient' },
    })

    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      source: 'owned_scan',
      discoveredAt: 200,
      ownerVerified: true,
    })
    const row = sqlite.prepare(`SELECT * FROM discovery_candidates`).get()
    expect(row).toMatchObject({
      source: 'owned_scan',
      attempt_count: 0,
      outcome: 'pending',
      rejection_reason: null,
      retry_state: 'ready',
      owner_verified: 1,
    })

    const secondClaim = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 201,
      staleBefore: 1,
      token: 'second',
    })
    expect(secondClaim?._tag).toBe('claimed')
    await finishDiscoveryCandidateAttempt(db, {
      owner: 'acme',
      repo: 'skills',
      token: 'second',
      now: 202,
      outcome: { _tag: 'indexed' },
    })
    expect(sqlite.prepare(`SELECT outcome, retry_state FROM discovery_candidates`).get()).toEqual({
      outcome: 'indexed',
      retry_state: 'complete',
    })
  })

  it('allows only one concurrent claim token', async () => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      source: 'owned_scan',
      discoveredAt: 100,
      ownerVerified: true,
    })
    const first = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 101,
      staleBefore: 1,
      token: 'first',
    })
    const second = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 101,
      staleBefore: 1,
      token: 'second',
    })

    expect(first?._tag).toBe('claimed')
    expect(second).toEqual({ _tag: 'active_claim' })
    expect(sqlite.prepare(`SELECT attempt_count, claim_token FROM discovery_candidates`).get()).toEqual({
      attempt_count: 1,
      claim_token: 'first',
    })
  })

  it('resumes the same durable job claim without consuming another attempt', async () => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      source: 'owned_scan',
      discoveredAt: 100,
      ownerVerified: true,
    })
    await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 101,
      staleBefore: 1,
      token: 'job-1',
    })

    const resumed = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 200,
      staleBefore: 50,
      token: 'job-1',
    })

    expect(resumed).toEqual({ _tag: 'claimed', attemptCount: 1, ownerVerified: true })
    expect(sqlite.prepare(
      `SELECT attempt_count, claimed_at, claim_token FROM discovery_candidates`,
    ).get()).toEqual({
      attempt_count: 1,
      claimed_at: 200,
      claim_token: 'job-1',
    })
  })

  it('does not let rediscovery steal an active claim', async () => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      source: 'github_search',
      discoveredAt: 100,
      ownerVerified: false,
    })
    await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 101,
      staleBefore: 1,
      token: 'first',
    })

    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      source: 'owned_scan',
      discoveredAt: 102,
      ownerVerified: true,
    })
    const second = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'skills',
      now: 102,
      staleBefore: 1,
      token: 'second',
    })

    expect(second).toEqual({ _tag: 'active_claim' })
    expect(sqlite.prepare(`SELECT claim_token, owner_verified FROM discovery_candidates`).get()).toEqual({
      claim_token: 'first',
      owner_verified: 1,
    })
  })

  it.each([
    ['retry_scheduled', 5, 'unclassified_rejection'],
    ['exhausted', 1, 'unclassified_rejection'],
  ])('keeps an unchanged %s candidate bounded across rediscovery', async (expectedState, maxAttempts, reason) => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'bounded',
      source: 'github_search',
      discoveredAt: 100,
      ownerVerified: false,
    })
    await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'bounded',
      now: 101,
      staleBefore: 1,
      token: 'first',
    })
    await finishDiscoveryCandidateAttempt(db, {
      owner: 'acme',
      repo: 'bounded',
      token: 'first',
      now: 102,
      maxAttempts,
      outcome: { _tag: 'rejected', reason },
    })

    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'bounded',
      source: 'owned_scan',
      discoveredAt: 200,
      ownerVerified: false,
    })

    expect(sqlite.prepare(
      `SELECT first_discovered_at, last_discovered_at, attempt_count, outcome, retry_state
       FROM discovery_candidates`,
    ).get()).toEqual({
      first_discovered_at: 100,
      last_discovered_at: 200,
      attempt_count: 1,
      outcome: 'rejected',
      retry_state: expectedState,
    })
  })

  it.each([
    'no_supported_skill_paths',
    'root_skill_unsupported',
    'trust_inputs_insufficient',
  ])('exhausts deterministic rejection %s after the first attempt', async (reason) => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'terminal',
      source: 'historical_inventory',
      discoveredAt: 100,
      ownerVerified: false,
    })
    await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'terminal',
      now: 101,
      staleBefore: 1,
      token: 'first',
    })

    await finishDiscoveryCandidateAttempt(db, {
      owner: 'acme',
      repo: 'terminal',
      token: 'first',
      now: 102,
      outcome: { _tag: 'rejected', reason },
    })

    expect(sqlite.prepare(
      `SELECT attempt_count, outcome, rejection_reason, retry_state, next_retry_at
       FROM discovery_candidates`,
    ).get()).toEqual({
      attempt_count: 1,
      outcome: 'rejected',
      rejection_reason: reason,
      retry_state: 'exhausted',
      next_retry_at: null,
    })
  })

  it('retries an unclassified rejection because its permanence is unknown', async () => {
    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'unknown',
      source: 'github_search',
      discoveredAt: 100,
      ownerVerified: false,
    })
    await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'unknown',
      now: 101,
      staleBefore: 1,
      token: 'first',
    })

    await finishDiscoveryCandidateAttempt(db, {
      owner: 'acme',
      repo: 'unknown',
      token: 'first',
      now: 102,
      outcome: { _tag: 'rejected', reason: 'unclassified_rejection' },
    })

    expect(sqlite.prepare(
      `SELECT retry_state, next_retry_at FROM discovery_candidates`,
    ).get()).toEqual({
      retry_state: 'retry_scheduled',
      next_retry_at: 3702,
    })
  })

  it('manually reconsiders an exhausted candidate and keeps discovery time monotonic', async () => {
    sqlite.prepare(
      `INSERT INTO discovery_candidates (
         owner, repo, source, first_discovered_at, last_discovered_at,
         attempt_count, outcome, rejection_reason, retry_state
       ) VALUES ('acme', 'manual', 'github_search', 100, 200, 5, 'rejected', 'trust_inputs_insufficient', 'exhausted')`,
    ).run()

    await upsertDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'manual',
      source: 'manual',
      discoveredAt: 150,
      ownerVerified: false,
      manualReconsideration: true,
    })

    expect(sqlite.prepare(
      `SELECT first_discovered_at, last_discovered_at, attempt_count, outcome, retry_state
       FROM discovery_candidates`,
    ).get()).toEqual({
      first_discovered_at: 100,
      last_discovered_at: 200,
      attempt_count: 0,
      outcome: 'pending',
      retry_state: 'ready',
    })
  })

  it.each([
    ['active', `VALUES ('acme', 'active', 'owned_scan', 1, 1, 1, 'pending', NULL, NULL, 'claimed', NULL, 1, 100, 'other')`, 'active_claim'],
    ['not-due', `VALUES ('acme', 'not-due', 'owned_scan', 1, 1, 1, 'rejected', 'reason', NULL, 'retry_scheduled', 500, 1, NULL, NULL)`, 'not_due'],
    ['complete', `VALUES ('acme', 'complete', 'owned_scan', 1, 1, 1, 'indexed', NULL, NULL, 'complete', NULL, 1, NULL, NULL)`, 'complete'],
    ['exhausted', `VALUES ('acme', 'exhausted', 'owned_scan', 1, 1, 5, 'rejected', 'reason', NULL, 'exhausted', NULL, 1, NULL, NULL)`, 'exhausted'],
  ])('reports %s claim unavailability truthfully', async (_label, values, expectedTag) => {
    sqlite.exec(`
      INSERT INTO discovery_candidates (
        owner, repo, source, first_discovered_at, last_discovered_at,
        attempt_count, outcome, rejection_reason, last_error, retry_state,
        next_retry_at, owner_verified, claimed_at, claim_token
      ) ${values};
    `)
    const repo = sqlite.prepare(`SELECT repo FROM discovery_candidates`).pluck().get() as string

    const result = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo,
      now: 200,
      staleBefore: 50,
      token: 'new',
    })

    expect(result).toEqual({ _tag: expectedTag })
  })

  it('reports a missing candidate explicitly', async () => {
    const result = await claimDiscoveryCandidate(db, {
      owner: 'acme',
      repo: 'missing',
      now: 200,
      staleBefore: 50,
      token: 'new',
    })

    expect(result).toEqual({ _tag: 'missing' })
  })

  it.each([
    ['missing', true],
    ['state_changed', true],
    ['active_claim', false],
    ['complete', false],
    ['exhausted', false],
    ['not_due', false],
  ] as const)('classifies scheduled %s claims with alertable=%s', (tag, alertable) => {
    expect(classifyDiscoveryClaimUnavailable({ _tag: tag })).toEqual({
      _tag: tag,
      alertable,
    })
  })
})

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

describe('sync failure permanence', () => {
  // A candidate whose repository is gone cannot succeed on a retry. Classifying
  // it as retryable burned five attempts each and then tripped the nightly
  // "exhausted automatic retries" alarm: 86 of the 95 exhausted candidates on
  // 2026-08-03 were `repo fetch 404`. `syncRepoAssetBackfill` already treats
  // only 403, 429 and 5xx as retryable; this mirrors that.
  it('rejects a repository that upstream reports as gone', () => {
    for (const status of [404, 410]) {
      expect(discoveryOutcomeFromSyncStats({
        status: 'failed',
        reason: `repo fetch ${status}`,
      } as never)).toEqual({ _tag: 'rejected', reason: `repo fetch ${status}` })
    }
  })

  it('rejects a tree the API cannot return whole', () => {
    expect(discoveryOutcomeFromSyncStats({
      status: 'failed',
      reason: 'tree_truncated',
    } as never)).toEqual({ _tag: 'rejected', reason: 'tree_truncated' })
  })

  it('keeps retrying throttled and server-side failures', () => {
    for (const status of [403, 429, 500, 502]) {
      expect(discoveryOutcomeFromSyncStats({
        status: 'failed',
        reason: `repo fetch ${status}`,
      } as never)).toEqual({ _tag: 'retryable_failure', error: `repo fetch ${status}` })
    }
  })

  it('keeps retrying a failure it cannot classify', () => {
    expect(discoveryOutcomeFromSyncStats({
      status: 'failed',
      reason: 'blob_batch_partial:some/path/SKILL.md',
    } as never)).toEqual({
      _tag: 'retryable_failure',
      error: 'blob_batch_partial:some/path/SKILL.md',
    })
  })
})
