import type {
  DigestDeliveryDependencies,
} from '../../layers/identity/server/utils/digest-delivery'
import type { DigestUser } from '../../layers/identity/server/utils/digest-select'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDigestDeliveryForUser } from '../../layers/identity/server/utils/digest-delivery'
import { selectDigestForUser } from '../../layers/identity/server/utils/digest-select'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'

describe('digest delivery', () => {
  let sqlite: Database.Database
  let db: D1Database
  let claimSequence: number
  let failSentWritesRemaining: number
  let failUncertainWritesRemaining: number

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(TEST_SCHEMA)
    failSentWritesRemaining = 0
    failUncertainWritesRemaining = 0
    db = wrapSqlite(sqlite, (sql) => {
      if (failSentWritesRemaining > 0 && sql.includes(`SET status = 'sent'`)) {
        failSentWritesRemaining -= 1
        return true
      }
      if (failUncertainWritesRemaining > 0 && sql.includes(`SET status = 'uncertain'`)) {
        failUncertainWritesRemaining -= 1
        return true
      }
      return false
    })
    claimSequence = 0
    seedSubscription(sqlite)
  })

  afterEach(() => sqlite.close())

  it('claims first, then records a missing recipient as failed preflight', async () => {
    const send = vi.fn()

    const result = await runDigestDeliveryForUser(
      dependencies({ send }),
      digestUser({ digest_email: null, email: null }),
      { scheduledAt: 7_299, siteUrl: 'https://skilld.dev' },
    )

    expect(result).toMatchObject({ _tag: 'failed', stage: 'preflight', error: 'missing_recipient' })
    expect(send).not.toHaveBeenCalled()
    expect(runRow()).toMatchObject({
      status: 'failed',
      error_code: 'missing_recipient',
      cursor_start: 0,
      cursor_end: 0,
    })
  })

  it('retries a rejected provider send within the same run', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn()
      .mockResolvedValueOnce({
        _tag: 'rejected',
        error: 'transient provider outage',
      })
      .mockResolvedValueOnce({
        _tag: 'accepted',
        messageId: 'message-retry',
      })
    const deps = dependencies({ send })

    const result = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })

    expect(result).toMatchObject({ _tag: 'sent', providerMessageId: 'message-retry' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(sqlite.prepare(`SELECT count(*) FROM digest_runs`).pluck().get()).toBe(1)
    expect(runRow()).toMatchObject({
      status: 'sent',
      window_end: 7_200,
      provider_message_id: 'message-retry',
    })
  })

  it('records the failure when the immediate retry rejects again', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn(async () => ({
      _tag: 'rejected' as const,
      error: 'still rejecting',
    }))

    const result = await runDigestDeliveryForUser(dependencies({ send }), digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })

    expect(result).toMatchObject({ _tag: 'failed', stage: 'provider', error: 'provider_failure' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(runRow()).toMatchObject({
      status: 'failed',
      error_code: 'provider_failure',
      error_message: 'still rejecting',
    })
  })

  it('reclaims the exact failed window without consuming its cursor', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn()
      .mockResolvedValueOnce({
        _tag: 'rejected',
        error: 'destination rejected',
      })
      .mockResolvedValueOnce({
        _tag: 'rejected',
        error: 'destination rejected',
      })
      .mockResolvedValueOnce({
        _tag: 'accepted',
        messageId: 'message-1',
      })
    const deps = dependencies({ send })

    const failed = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    const retried = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })

    expect(failed).toMatchObject({ _tag: 'failed', stage: 'provider' })
    expect(retried).toMatchObject({ _tag: 'sent', providerMessageId: 'message-1' })
    expect(send).toHaveBeenCalledTimes(3)
    expect(sqlite.prepare(`SELECT count(*) FROM digest_runs`).pluck().get()).toBe(1)
    expect(runRow()).toMatchObject({
      status: 'sent',
      window_end: 7_200,
      cursor_start: 0,
      cursor_end: 1,
      attempt_count: 2,
      provider_message_id: 'message-1',
    })
  })

  it('allows two concurrent invocations to call the provider once', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    let releaseSend!: () => void
    const sendStarted = new Promise<void>((resolve) => {
      releaseSend = resolve
    })
    const send = vi.fn(async () => {
      releaseSend()
      await Promise.resolve()
      return {
        _tag: 'accepted' as const,
        messageId: 'message-concurrent',
      }
    })
    const deps = dependencies({ send })

    const firstPromise = runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    await sendStarted
    const second = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    const first = await firstPromise

    expect(first).toMatchObject({ _tag: 'sent' })
    expect(second).toMatchObject({ _tag: 'delivery_uncertain', reason: 'prior_sending' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('recovers accepted provider evidence without resending, then advances to the next cursor window', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn()
      .mockResolvedValueOnce({
        _tag: 'accepted',
        messageId: 'message-recovered',
      })
      .mockResolvedValueOnce({
        _tag: 'accepted',
        messageId: 'message-next',
      })
    const deps = dependencies({ send })
    failSentWritesRemaining = 1

    const uncertain = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    expect(uncertain).toMatchObject({
      _tag: 'delivery_uncertain',
      reason: 'provider_success_persistence_failed',
    })
    expect(runRow()).toMatchObject({
      status: 'uncertain',
      provider_status: 'accepted_unpersisted',
      provider_message_id: 'message-recovered',
      error_code: 'sent_persistence_failed',
      error_message: 'terminal write unavailable',
    })

    const recovered = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 93_700,
      siteUrl: 'https://skilld.dev',
    })
    expect(recovered).toMatchObject({ _tag: 'already_processed', status: 'sent' })
    expect(runRow()).toMatchObject({
      status: 'sent',
      provider_status: 'accepted',
      provider_message_id: 'message-recovered',
      error_code: null,
      error_message: null,
    })
    expect(send).toHaveBeenCalledTimes(1)

    seedActivity(sqlite, { id: 2, name: 'alpha', occurredAt: 50, ingestedAt: 93_650, sha: 'sha-late' })
    const future = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 180_100,
      siteUrl: 'https://skilld.dev',
    })
    expect(future).toMatchObject({ _tag: 'sent', providerMessageId: 'message-next' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(sqlite.prepare(
      `SELECT window_end, cursor_start, cursor_end, status, provider_message_id
       FROM digest_runs ORDER BY window_end`,
    ).all()).toEqual([
      {
        window_end: 7_200,
        cursor_start: 0,
        cursor_end: 1,
        status: 'sent',
        provider_message_id: 'message-recovered',
      },
      {
        window_end: 180_000,
        cursor_start: 1,
        cursor_end: 2,
        status: 'sent',
        provider_message_id: 'message-next',
      },
    ])
  })

  it('leaves safe sending state when accepted outcome diagnostics cannot be persisted', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn(async () => ({
      _tag: 'accepted' as const,
      messageId: 'message-unrecorded',
    }))
    const deps = dependencies({ send })
    failSentWritesRemaining = 1
    failUncertainWritesRemaining = 1

    const uncertain = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    const later = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 93_700,
      siteUrl: 'https://skilld.dev',
    })

    expect(uncertain).toMatchObject({
      _tag: 'delivery_uncertain',
      reason: 'provider_success_persistence_failed',
    })
    expect(uncertain.error).toContain('could not persist accepted provider evidence')
    expect(runRow()).toMatchObject({ status: 'sending', provider_message_id: null })
    expect(later).toMatchObject({ _tag: 'delivery_uncertain', reason: 'prior_sending' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('delivers late-ingested old activity in the next cursor window', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn()
      .mockResolvedValueOnce({
        _tag: 'accepted',
        messageId: 'message-1',
      })
      .mockResolvedValueOnce({
        _tag: 'accepted',
        messageId: 'message-2',
      })
    const deps = dependencies({ send })

    await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    seedActivity(sqlite, { id: 2, name: 'alpha', occurredAt: 50, ingestedAt: 93_650, sha: 'sha-late' })
    const future = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 93_700,
      siteUrl: 'https://skilld.dev',
    })

    expect(future).toMatchObject({ _tag: 'sent' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(sqlite.prepare(
      `SELECT window_end, cursor_start, cursor_end, status
       FROM digest_runs ORDER BY window_end`,
    ).all()).toEqual([
      { window_end: 7_200, cursor_start: 0, cursor_end: 1, status: 'sent' },
      { window_end: 93_600, cursor_start: 1, cursor_end: 2, status: 'sent' },
    ])
    expect(send.mock.calls[1]![0].text).toContain('late alpha')
  })

  it('keeps several changed skills and their counts consistent across AI, template, and email', async () => {
    seedActivity(sqlite, { id: 1, name: 'beta', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-b1' })
    seedActivity(sqlite, { id: 2, name: 'alpha', occurredAt: 100, ingestedAt: 7_101, sha: 'sha-a' })
    seedActivity(sqlite, { id: 3, name: 'beta', occurredAt: 102, ingestedAt: 7_102, sha: 'sha-b2' })
    const summarise = vi.fn(async () => ({
      _tag: 'summarized' as const,
      summaries: [{ owner: 'acme', repo: 'skills', sentence: 'Alpha and beta changed.' }],
      usage: { inputTokens: 12, outputTokens: 5 },
    }))
    const send = vi.fn(async () => ({
      _tag: 'accepted' as const,
      messageId: 'message-multi',
    }))

    await runDigestDeliveryForUser(
      dependencies({ summarise, send }),
      digestUser(),
      { scheduledAt: 7_299, siteUrl: 'https://skilld.dev' },
    )

    expect(summarise).toHaveBeenCalledWith({
      subscriptions: [{
        owner: 'acme',
        repo: 'skills',
        skills: [
          { name: 'alpha', description: 'Alpha skill', changeCount: 1 },
          { name: 'beta', description: 'Beta skill', changeCount: 2 },
        ],
      }],
      changes: [{
        owner: 'acme',
        repo: 'skills',
        totalChangeCount: 3,
        skills: [
          { name: 'alpha', changeCount: 1, commitMessages: ['changed alpha'] },
          { name: 'beta', changeCount: 2, commitMessages: ['second beta', 'first beta'] },
        ],
        diffExcerpt: '',
      }],
    })
    expect(send.mock.calls[0]![0].text).toContain('acme/skills alpha')
    expect(send.mock.calls[0]![0].text).toContain('acme/skills beta')
    expect(send.mock.calls[0]![0].text).toContain('2 changes')
    expect(runRow()).toMatchObject({
      change_count: 3,
      ai_summary_used: 1,
      ai_input_tokens: 12,
      ai_output_tokens: 5,
    })
  })

  it('reclaims stale pre-send claims and blocks active claims', async () => {
    insertClaim(sqlite, { claimedAt: 6_000, expiresAt: 6_300, token: 'stale' })
    const stale = await runDigestDeliveryForUser(
      dependencies(),
      digestUser(),
      { scheduledAt: 7_299, siteUrl: 'https://skilld.dev' },
    )
    expect(stale).toMatchObject({ _tag: 'skipped' })
    expect(runRow()).toMatchObject({ status: 'skipped', attempt_count: 2 })

    sqlite.prepare(`DELETE FROM digest_runs`).run()
    insertClaim(sqlite, { claimedAt: 7_100, expiresAt: 7_500, token: 'active' })
    const active = await runDigestDeliveryForUser(
      dependencies(),
      digestUser(),
      { scheduledAt: 7_299, siteUrl: 'https://skilld.dev' },
    )
    expect(active).toMatchObject({ _tag: 'claimed', reason: 'active_claim' })
    expect(runRow()).toMatchObject({ status: 'claimed', attempt_count: 1, claim_token: 'active' })
  })

  it('records explicit AI fallback while still sending', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn(async () => ({
      _tag: 'accepted' as const,
      messageId: 'message-fallback',
    }))

    const result = await runDigestDeliveryForUser(
      dependencies({
        send,
        summarise: async () => ({
          _tag: 'fallback',
          reason: 'provider_failure',
          error: 'AI unavailable',
        }),
      }),
      digestUser(),
      { scheduledAt: 7_299, siteUrl: 'https://skilld.dev' },
    )

    expect(result).toMatchObject({
      _tag: 'sent',
      aiFallbackReason: 'provider_failure: AI unavailable',
    })
    expect(runRow()).toMatchObject({
      status: 'sent',
      ai_summary_used: 0,
      ai_fallback_reason: 'provider_failure: AI unavailable',
    })
  })

  it('sends a stable campaign header and persists the nonempty provider message ID', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'sha-a' })
    const send = vi.fn(async () => ({
      _tag: 'accepted' as const,
      messageId: 'message-stable',
    }))

    const result = await runDigestDeliveryForUser(
      dependencies({ send }),
      digestUser(),
      { scheduledAt: 7_299, siteUrl: 'https://skilld.dev' },
    )

    const expectedKey = 'skilld-digest:1:7200'
    expect(result).toMatchObject({ _tag: 'sent', deliveryKey: expectedKey })
    expect(send.mock.calls[0]![0].headers).toMatchObject({ 'X-Campaign-ID': expectedKey })
    expect(runRow()).toMatchObject({
      delivery_key: expectedKey,
      provider_message_id: 'message-stable',
      provider_status: 'accepted',
    })
  })

  it('persists an unknown tagged provider outcome and does not retry', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'blob-a' })
    const send = vi.fn(async () => ({
      _tag: 'uncertain' as const,
      error: 'provider acknowledgement malformed',
    }))
    const deps = dependencies({ send })

    const uncertain = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    const retry = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 93_700,
      siteUrl: 'https://skilld.dev',
    })

    expect(uncertain).toMatchObject({
      _tag: 'delivery_uncertain',
      reason: 'provider_uncertain',
      error: 'provider acknowledgement malformed',
    })
    expect(retry).toMatchObject({ _tag: 'delivery_uncertain', reason: 'prior_uncertain' })
    expect(runRow()).toMatchObject({
      status: 'uncertain',
      provider_status: 'unknown',
      provider_message_id: null,
      error_code: 'provider_outcome_unknown',
      error_message: 'provider acknowledgement malformed',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('persists a directly thrown provider outcome as unknown and does not retry', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'blob-a' })
    const send = vi.fn(async () => {
      throw new Error('sender transport closed')
    })
    const deps = dependencies({ send })

    const uncertain = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 7_299,
      siteUrl: 'https://skilld.dev',
    })
    const retry = await runDigestDeliveryForUser(deps, digestUser(), {
      scheduledAt: 93_700,
      siteUrl: 'https://skilld.dev',
    })

    expect(uncertain).toMatchObject({
      _tag: 'delivery_uncertain',
      reason: 'provider_threw',
      error: 'sender transport closed',
    })
    expect(retry).toMatchObject({ _tag: 'delivery_uncertain', reason: 'prior_uncertain' })
    expect(runRow()).toMatchObject({
      status: 'uncertain',
      provider_status: 'unknown',
      error_code: 'provider_outcome_unknown',
      error_message: 'sender transport closed',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('keeps safe sending state when unknown outcome diagnostics cannot be persisted', async () => {
    seedActivity(sqlite, { id: 1, name: 'alpha', occurredAt: 100, ingestedAt: 7_100, sha: 'blob-a' })
    failUncertainWritesRemaining = 1
    const send = vi.fn(async () => {
      throw new Error('sender transport closed')
    })

    const uncertain = await runDigestDeliveryForUser(
      dependencies({ send }),
      digestUser(),
      { scheduledAt: 7_299, siteUrl: 'https://skilld.dev' },
    )

    expect(uncertain).toMatchObject({
      _tag: 'delivery_uncertain',
      reason: 'provider_threw',
    })
    expect(uncertain.error).toContain('could not persist unknown provider outcome')
    expect(runRow()).toMatchObject({
      status: 'sending',
      provider_status: null,
      error_code: null,
      error_message: null,
    })
  })

  function dependencies(
    overrides: Partial<DigestDeliveryDependencies> = {},
  ): DigestDeliveryDependencies {
    return {
      db,
      now: () => 7_299,
      newClaimToken: () => `claim-${++claimSequence}`,
      select: selectDigestForUser,
      summarise: async () => ({ _tag: 'summarized', summaries: [], usage: null }),
      render: renderDigest,
      signUnsubscribe: async () => 'unsubscribe-token',
      send: async () => ({
        _tag: 'accepted',
        messageId: 'message-default',
      }),
      ...overrides,
    }
  }

  function runRow(): Record<string, unknown> {
    return sqlite.prepare(`SELECT * FROM digest_runs ORDER BY id DESC LIMIT 1`).get() as Record<string, unknown>
  }
})

function digestUser(overrides: Partial<DigestUser> = {}): DigestUser {
  return {
    id: 1,
    login: 'harlan',
    digest_email: 'harlan@example.com',
    email: 'harlan@example.com',
    email_opt_in: 1,
    onboarded_at: 1,
    ...overrides,
  }
}

function seedSubscription(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO users (id) VALUES (1);
    INSERT INTO repos (owner, repo, repo_kind) VALUES ('acme', 'skills', 'source');
    INSERT INTO skill_subscriptions (user_id, owner, repo, muted_until)
    VALUES (1, 'acme', 'skills', NULL);
    INSERT INTO skills (owner, repo, name, description, current_sha, rendered_skill_path) VALUES
      ('acme', 'skills', 'alpha', 'Alpha skill', 'current-alpha', 'alpha/SKILL.md'),
      ('acme', 'skills', 'beta', 'Beta skill', 'current-beta', 'beta/SKILL.md');
    INSERT INTO skill_revisions (owner, repo, name, sha, modified_at, message) VALUES
      ('acme', 'skills', 'alpha', 'commit-a', 100, 'changed alpha'),
      ('acme', 'skills', 'alpha', 'commit-late', 50, 'late alpha'),
      ('acme', 'skills', 'beta', 'commit-b1', 100, 'first beta'),
      ('acme', 'skills', 'beta', 'commit-b2', 102, 'second beta');
  `)
}

function seedActivity(
  sqlite: Database.Database,
  input: { id: number, name: string, occurredAt: number, ingestedAt: number, sha: string },
): void {
  sqlite.prepare(
    `INSERT INTO activity (id, owner, repo, name, occurred_at, ingested_at, sha)
     VALUES (?, 'acme', 'skills', ?, ?, ?, ?)`,
  ).run(input.id, input.name, input.occurredAt, input.ingestedAt, input.sha)
}

function insertClaim(
  sqlite: Database.Database,
  input: { claimedAt: number, expiresAt: number, token: string },
): void {
  sqlite.prepare(
    `INSERT INTO digest_runs (
       user_id, delivery_key, window_start, window_end, cursor_start, cursor_end,
       change_count, status, claim_token, claimed_at, claim_expires_at, attempt_count
     ) VALUES (1, 'skilld-digest:1:7200', 1, 7200, 0, 0, 0, 'claimed', ?, ?, ?, 1)`,
  ).run(input.token, input.claimedAt, input.expiresAt)
}

const TEST_SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id INTEGER PRIMARY KEY);
  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    name TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    ingested_at INTEGER NOT NULL,
    sha TEXT NOT NULL
  );
  CREATE TABLE skills (
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    current_sha TEXT,
    rendered_skill_path TEXT,
    PRIMARY KEY (owner, repo, name)
  );
  CREATE TABLE repos (
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    repo_kind TEXT NOT NULL,
    default_branch TEXT,
    PRIMARY KEY (owner, repo)
  );
  CREATE TABLE skill_subscriptions (
    user_id INTEGER NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    muted_until INTEGER,
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE skill_likes (
    user_id INTEGER NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, owner, repo, name)
  );
  CREATE TABLE skill_revisions (
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    name TEXT NOT NULL,
    sha TEXT NOT NULL,
    modified_at INTEGER NOT NULL,
    message TEXT,
    PRIMARY KEY (owner, repo, name, sha)
  );
  CREATE TABLE digest_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivery_key TEXT NOT NULL UNIQUE,
    window_start INTEGER NOT NULL,
    window_end INTEGER NOT NULL,
    cursor_start INTEGER NOT NULL,
    cursor_end INTEGER NOT NULL,
    change_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    claim_token TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    claim_expires_at INTEGER,
    sending_at INTEGER,
    sent_at INTEGER,
    finished_at INTEGER,
    attempt_count INTEGER NOT NULL,
    provider_message_id TEXT,
    provider_status TEXT,
    error_code TEXT,
    error_message TEXT,
    ai_summary_used INTEGER NOT NULL DEFAULT 0,
    ai_fallback_reason TEXT,
    ai_input_tokens INTEGER NOT NULL DEFAULT 0,
    ai_output_tokens INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, window_end)
  );
`

interface StoredStatement {
  sql: string
  params: unknown[]
}

function wrapSqlite(
  sqlite: Database.Database,
  shouldFail: (sql: string) => boolean,
): D1Database {
  const prepare = (sql: string) => {
    const make = (params: unknown[]): D1PreparedStatement & StoredStatement => ({
      sql,
      params,
      bind: (...next: unknown[]) => make(next),
      async run() {
        if (shouldFail(sql))
          throw new Error('terminal write unavailable')
        const expanded = expandNumberedPlaceholders(sql, params)
        const result = sqlite.prepare(expanded.sql).run(...expanded.params)
        return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } } as unknown as D1Result
      },
      async first<T>() {
        const expanded = expandNumberedPlaceholders(sql, params)
        return (sqlite.prepare(expanded.sql).get(...expanded.params) as T | undefined) ?? null
      },
      async all<T>() {
        const expanded = expandNumberedPlaceholders(sql, params)
        return { results: sqlite.prepare(expanded.sql).all(...expanded.params) as T[] } as D1Result<T>
      },
    } as unknown as D1PreparedStatement & StoredStatement)
    return make([])
  }
  return {
    prepare,
    batch: async (statements: D1PreparedStatement[]) => {
      const transaction = sqlite.transaction((items: Array<D1PreparedStatement & StoredStatement>) =>
        items.map((item) => {
          if (shouldFail(item.sql))
            throw new Error('terminal write unavailable')
          const expanded = expandNumberedPlaceholders(item.sql, item.params)
          if (item.sql.trimStart().startsWith('SELECT')) {
            return {
              results: sqlite.prepare(expanded.sql).all(...expanded.params),
              meta: { changes: 0 },
            }
          }
          const result = sqlite.prepare(expanded.sql).run(...expanded.params)
          return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } }
        }))
      return transaction(statements as Array<D1PreparedStatement & StoredStatement>) as D1Result[]
    },
  } as unknown as D1Database
}

function expandNumberedPlaceholders(
  sql: string,
  params: unknown[],
): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
