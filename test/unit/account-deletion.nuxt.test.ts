import type { EventHandler, H3Event } from 'h3'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAccountData, loadGithubGrant, revokeGithubGrant } from '../../layers/identity/server/utils/account-deletion'
import { issueSession } from '../../layers/identity/server/utils/cli-tokens'
import { encryptToken } from '../../layers/identity/server/utils/crypto'
import { accountDeletionConfirmed } from '../../layers/identity/shared/contracts/account'
import { emitOperationalEvent } from '../../server/utils/operational-event'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'
import { SIGNED_IN_HEADERS } from './helpers/session'

const NOW = 1_789_603_200
const DAY = 86_400
const TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
const OTHER_TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(8)))
const CLIENT = { clientId: 'skilld-oauth-client', clientSecret: 'skilld-oauth-secret' }

interface Account {
  id: number
  login: string
  /** One hex digit that keeps unique columns unique between accounts. */
  hex: string
}

const OCTOCAT: Account = { id: 7001, login: 'octocat', hex: 'a' }
const HUBOT: Account = { id: 7002, login: 'hubot', hex: 'b' }

/**
 * Columns that name an account but that account deletion leaves alone.
 * Every other column found by `accountColumns` must be cleared.
 */
const KEPT_ACCOUNT_COLUMNS = {
  'jobs.user_id': 'cf-jobs column. No job payload in this codebase carries a userId.',
  'failed_jobs.user_id': 'cf-jobs column. No job payload in this codebase carries a userId.',
  'job_batches.user_id': 'cf-jobs column. No job batch in this codebase carries a userId.',
  'weekly_click_events.user_id': 'Migration 0118 (#240) drops this table and every row in it.',
} satisfies Record<string, string>

const ACCOUNT_COLUMN_NAMES = new Set(['user_id', 'account_id', 'author_user_id'])

/**
 * Every `table.column` in the migrated schema that holds an account id: a
 * foreign key to `users`, or a column named like one.
 */
function accountColumns(raw: DatabaseSync): string[] {
  const tables = raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
  const columns = tables.flatMap(({ name: table }) => {
    const named = (raw.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as Array<{ name: string }>)
      .map(column => column.name)
      .filter(column => ACCOUNT_COLUMN_NAMES.has(column))
    const referencing = (raw.prepare(`SELECT "from" AS name FROM pragma_foreign_key_list(?) WHERE "table" = 'users'`).all(table) as Array<{ name: string }>)
      .map(column => column.name)
    return [...new Set([...named, ...referencing])].map(column => `${table}.${column}`)
  })
  return ['users.id', ...columns].sort()
}

function rowsNaming(raw: DatabaseSync, column: string, accountId: number): number {
  const [table, name] = column.split('.')
  const row = raw.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE "${name}" = ?`).get(accountId) as { count: number }
  return row.count
}

function seedAccount(raw: DatabaseSync, account: Account, githubToken: string | null = null): void {
  const run = (sql: string, ...values: SQLInputValue[]) => raw.prepare(sql).run(...values)
  const { id, login, hex } = account
  const sha = hex.repeat(64)
  const artifactId = `sha256:${sha}`
  const resolutionId = `resolution-${login}`
  const installationId = 600_000 + id
  const repositoryId = 500_000 + id

  run(
    `INSERT INTO users (
       id, github_id, login, name, email, digest_email, avatar,
       github_token_encrypted, github_token_scopes, github_token_client_id,
       email_opt_in, created_at, last_login_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'read:user user:email', ?, 1, ?, ?)`,
    id,
    900_000 + id,
    login,
    `${login} name`,
    `${login}@example.com`,
    `${login}@example.com`,
    `https://avatars.githubusercontent.com/u/${id}`,
    githubToken,
    githubToken ? CLIENT.clientId : null,
    NOW - 30 * DAY,
    NOW,
  )
  run(`INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (?, 'acme', 'skills', 'diagnose', ?)`, id, NOW)
  run(`INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES (?, 'acme', 'skills', 'like', ?)`, id, NOW)
  run(`INSERT INTO user_starred_repos (user_id, owner, repo, starred_at, has_skill) VALUES (?, 'acme', 'skills', ?, 1)`, id, NOW)
  const collectionId = run(
    `INSERT INTO collections_v2 (author_user_id, slug, name, created_at, updated_at) VALUES (?, 'stack', 'Stack', ?, ?)`,
    id,
    NOW,
    NOW,
  ).lastInsertRowid
  run(
    `INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name, reason)
     VALUES (?, 0, 'acme', 'skills', 'tdd', 'Writes the failing test before the fix.')`,
    collectionId,
  )
  run(`INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name) VALUES (?, 1, 'acme', 'docs', NULL)`, collectionId)
  run(
    `INSERT INTO cli_tokens (user_id, refresh_hash, kind, device_label, created_at, last_used_at)
     VALUES (?, ?, 'pat', 'laptop', ?, ?)`,
    id,
    `refresh-${login}`,
    NOW,
    NOW,
  )
  run(
    `INSERT INTO cli_auth_codes (code, user_id, code_challenge, redirect_port, state, created_at, expires_at)
     VALUES (?, ?, 'challenge', 49152, 'state', ?, ?)`,
    `code-${login}`,
    id,
    NOW,
    NOW + 600,
  )
  run(
    `INSERT INTO cli_device_sessions (device_code, user_code, user_id, machine_hint, status, created_at, expires_at)
     VALUES (?, ?, ?, 'darwin-arm64', 'authorized', ?, ?)`,
    `device-${login}`,
    `CODE-${login}`,
    id,
    NOW,
    NOW + 600,
  )
  run(
    `INSERT INTO digest_runs (
       user_id, delivery_key, window_start, window_end, cursor_start, cursor_end,
       status, claim_token, claimed_at, finished_at
     ) VALUES (?, ?, ?, ?, 0, 5, 'skipped', 'claim', ?, ?)`,
    id,
    `digest-${login}`,
    NOW - 30 * DAY,
    NOW - DAY,
    NOW - DAY,
    NOW - DAY,
  )
  run(
    `INSERT INTO weekly_runs (user_id, window_start, window_end, status, claimed_at) VALUES (?, ?, ?, 'skipped', ?)`,
    id,
    NOW - 7 * DAY,
    NOW,
    NOW,
  )
  run(`INSERT INTO email_preference_events (user_id, list, action, occurred_at) VALUES (?, 'weekly', 'unsubscribed', ?)`, id, NOW)

  run(
    `INSERT INTO github_app_installations (installation_id, account_id, github_account_id, state, connected_at, verified_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    installationId,
    id,
    800_000 + id,
    NOW,
    NOW,
  )
  run(
    `INSERT INTO github_app_repositories (installation_id, repository_id, owner, repository, visibility, state, selected_at)
     VALUES (?, ?, ?, 'private-skills', 'private', 'selected', ?)`,
    installationId,
    repositoryId,
    login,
    NOW,
  )
  run(
    `INSERT INTO github_app_user_authorizations (
       account_id, access_token_encrypted, access_token_expires_at, refresh_token_encrypted,
       refresh_token_expires_at, client_id, authorized_at, updated_at
     ) VALUES (?, 'sealed-access', ?, 'sealed-refresh', ?, 'github-app-client', ?, ?)`,
    id,
    NOW + 3600,
    NOW + 30 * DAY,
    NOW,
    NOW,
  )
  run(`INSERT INTO skillgen_repositories (owner, repo, user_id, opted_in_at) VALUES (?, 'package', ?, ?)`, login, id, NOW)
  run(
    `INSERT INTO artifact_resolutions (
       id, request_fingerprint, state, requested_owner, requested_repository, selector_type,
       selector_value, repository_id, visibility, account_id, github_installation_id
     ) VALUES (?, ?, 'ready', ?, 'private-skills', 'named-skill', 'deploy', ?, 'private', ?, ?)`,
    resolutionId,
    `fingerprint-${login}`,
    login,
    repositoryId,
    id,
    installationId,
  )
  run(`INSERT INTO artifact_check_results (resolution_id, name, version, outcome, required) VALUES (?, 'skill-structure', '1', 'pass', 1)`, resolutionId)
  run(
    `INSERT INTO artifacts (id, content_sha256, content_bytes, format, r2_key) VALUES (?, ?, 128, 'skilld-tar-v1', ?)`,
    artifactId,
    sha,
    `artifacts/${login}`,
  )
  run(`INSERT INTO artifact_attestations (resolution_id, artifact_id, attestation_json) VALUES (?, ?, '{}')`, resolutionId, artifactId)
  run(
    `INSERT INTO private_artifacts (
       account_id, artifact_id, resolution_id, repository_id, content_sha256, content_bytes,
       ciphertext_sha256, ciphertext_bytes, r2_key, encryption_key_id, delivery_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 128, ?, 156, ?, ?, 'available', ?, ?)`,
    id,
    artifactId,
    resolutionId,
    repositoryId,
    sha,
    sha,
    `private/${login}`,
    `key-${login}`,
    NOW,
    NOW,
  )
  run(
    `INSERT INTO private_artifact_attestations (resolution_id, account_id, artifact_id, attestation_json, created_at)
     VALUES (?, ?, ?, '{}', ?)`,
    resolutionId,
    id,
    artifactId,
    NOW,
  )
  run(
    `INSERT INTO private_artifact_keys (account_id, key_id, wrapped_key, wrap_key_id, wrap_algorithm, state, created_at)
     VALUES (?, ?, 'wrapped', 'wrap-primary', 'A256KW', 'active', ?)`,
    id,
    `key-${login}`,
    NOW,
  )
  run(
    `INSERT INTO artifact_download_grants (token_hash, account_id, artifact_id, resolution_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'f'.repeat(63) + hex,
    id,
    artifactId,
    resolutionId,
    NOW + 60,
    NOW,
  )
}

describe('deleteAccountData', () => {
  let fixture: ReturnType<typeof createSqliteD1>

  beforeEach(() => {
    fixture = createSqliteD1(allMigrations())
  })

  afterEach(() => fixture.close())

  it.each([
    ['on', true],
    ['off', false],
  ])('leaves no row naming the account with foreign key enforcement %s', async (_label, enforced) => {
    fixture.raw.exec(`PRAGMA foreign_keys = ${enforced ? 'ON' : 'OFF'}`)
    seedAccount(fixture.raw, OCTOCAT)
    seedAccount(fixture.raw, HUBOT)
    const columns = accountColumns(fixture.raw).filter(column => !(column in KEPT_ACCOUNT_COLUMNS))
    // An unseeded column would pass the check below while deletion misses it.
    expect(columns.filter(column => rowsNaming(fixture.raw, column, OCTOCAT.id) === 0)).toEqual([])

    await deleteAccountData(fixture.db, OCTOCAT.id, NOW)

    expect(columns.filter(column => rowsNaming(fixture.raw, column, OCTOCAT.id) > 0)).toEqual([])
    expect(columns.filter(column => rowsNaming(fixture.raw, column, HUBOT.id) === 0)).toEqual([])
    // Collection entries, App repositories, and check results name no account.
    // They must not outlive the rows they belong to.
    expect(fixture.raw.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('queues the liked and collected Skills for a counter recount', async () => {
    seedAccount(fixture.raw, OCTOCAT)

    await deleteAccountData(fixture.db, OCTOCAT.id, NOW)

    const queued = fixture.raw.prepare(
      `SELECT owner, repo, name, reason, queued_at FROM skill_dirty ORDER BY reason`,
    ).all()
    expect(queued).toEqual([
      { owner: 'acme', repo: 'skills', name: 'tdd', reason: 'curator', queued_at: NOW },
      { owner: 'acme', repo: 'skills', name: 'diagnose', reason: 'like', queued_at: NOW },
    ])
  })
})

describe('revokeGithubGrant', () => {
  const stored = { _tag: 'stored', clientId: CLIENT.clientId, accessToken: 'gho_octocat' } as const

  it('deletes the grant with the OAuth app credentials', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }))

    const result = await revokeGithubGrant(stored, CLIENT, fetcher)

    expect(result).toEqual({ _tag: 'revoked' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.github.com/applications/skilld-oauth-client/grant')
    expect(init?.method).toBe('DELETE')
    expect(new Headers(init?.headers).get('authorization')).toBe(`Basic ${btoa('skilld-oauth-client:skilld-oauth-secret')}`)
    expect(JSON.parse(String(init?.body))).toEqual({ access_token: 'gho_octocat' })
  })

  it.each([
    ['GitHub refuses the token', async () => new Response('{"message":"Not Found"}', { status: 404 }), { _tag: 'failed', status: 404 }],
    ['GitHub is unreachable', async () => Promise.reject(new TypeError('fetch failed')), { _tag: 'failed', status: null }],
  ])('reports a failure when %s', async (_label, respond, expected) => {
    await expect(revokeGithubGrant(stored, CLIENT, vi.fn(respond))).resolves.toEqual(expected)
  })

  it.each([
    ['no token is stored', { _tag: 'absent' } as const, CLIENT, 'no-token'],
    ['the token cannot be decrypted', { _tag: 'unreadable' } as const, CLIENT, 'unreadable-token'],
    ['the client secret is missing', stored, { ...CLIENT, clientSecret: '' }, 'no-client-secret'],
    ['another OAuth app issued the token', { ...stored, clientId: 'retired-client' }, CLIENT, 'other-client'],
  ])('skips GitHub when %s', async (_label, grant, client, reason) => {
    const fetcher = vi.fn()

    const result = await revokeGithubGrant(grant, client, fetcher)

    expect(result).toEqual({ _tag: 'skipped', reason })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('loadGithubGrant', () => {
  let fixture: ReturnType<typeof createSqliteD1>

  beforeEach(() => {
    fixture = createSqliteD1(allMigrations())
  })

  afterEach(() => fixture.close())

  it('reads the stored sign-in token', async () => {
    seedAccount(fixture.raw, OCTOCAT, await encryptToken('gho_octocat', TOKEN_KEY))

    await expect(loadGithubGrant(fixture.db, OCTOCAT.id, TOKEN_KEY)).resolves.toEqual({
      _tag: 'stored',
      clientId: CLIENT.clientId,
      accessToken: 'gho_octocat',
    })
  })

  it('reports a token sealed with another key as unreadable', async () => {
    seedAccount(fixture.raw, OCTOCAT, await encryptToken('gho_octocat', OTHER_TOKEN_KEY))

    await expect(loadGithubGrant(fixture.db, OCTOCAT.id, TOKEN_KEY)).resolves.toEqual({ _tag: 'unreadable' })
  })

  it('reports no token after sign-out', async () => {
    seedAccount(fixture.raw, OCTOCAT)

    await expect(loadGithubGrant(fixture.db, OCTOCAT.id, TOKEN_KEY)).resolves.toEqual({ _tag: 'absent' })
  })
})

describe('accountDeletionConfirmed', () => {
  it.each([
    ['octocat', true],
    ['  OctoCat ', true],
    ['octocat2', false],
    ['hubot', false],
    ['', false],
  ])('treats %j as confirmation for octocat: %s', (typed, expected) => {
    expect(accountDeletionConfirmed(typed, 'octocat')).toBe(expected)
  })
})

describe('account deletion endpoint', () => {
  let fixture: ReturnType<typeof createSqliteD1>
  let sessionUserId: number | null
  let requestBody: unknown
  let githubResponse: () => Promise<Response>
  let githubFetch: ReturnType<typeof vi.fn>
  const clearUserSession = vi.fn()

  beforeEach(async () => {
    vi.resetModules()
    fixture = createSqliteD1(allMigrations())
    seedAccount(fixture.raw, OCTOCAT, await encryptToken('gho_octocat', TOKEN_KEY))
    seedAccount(fixture.raw, HUBOT)
    sessionUserId = OCTOCAT.id
    requestBody = { confirm_login: 'octocat' }
    githubResponse = async () => new Response(null, { status: 204 })
    githubFetch = vi.fn((..._args: unknown[]) => githubResponse())
    clearUserSession.mockReset()
    clearUserSession.mockImplementation(async () => {
      sessionUserId = null
      return true
    })

    // Unstubbing after each test also removes the wide event stubs from setup.
    vi.stubGlobal('createWideEvent', () => ({ context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }))
    vi.stubGlobal('emitOperationalEvent', emitOperationalEvent)
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('readBody', () => Promise.resolve(requestBody))
    // The CLI token helpers read the key from the environment in tests.
    vi.stubEnv('NUXT_TOKEN_KEY', TOKEN_KEY)
    vi.stubGlobal('getUserSession', () => Promise.resolve(
      sessionUserId === null ? {} : { user: { id: sessionUserId, login: 'octocat' } },
    ))
    vi.stubGlobal('clearUserSession', clearUserSession)
    vi.stubGlobal('fetch', githubFetch)
  })

  afterEach(() => {
    fixture.close()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  function request(headers: Record<string, string> = {}): H3Event {
    return {
      method: 'DELETE',
      path: '/api/me',
      context: {
        platform: {
          db: fixture.db,
          env: {
            NUXT_TOKEN_KEY: TOKEN_KEY,
            NUXT_OAUTH_GITHUB_CLIENT_ID: CLIENT.clientId,
            NUXT_OAUTH_GITHUB_CLIENT_SECRET: CLIENT.clientSecret,
          },
        },
      },
      node: { req: { headers: { ...SIGNED_IN_HEADERS, ...headers } }, res: {} },
    } as unknown as H3Event
  }

  async function deleteAccount(): Promise<EventHandler> {
    return (await import('../../layers/identity/server/api/me/index.delete')).default
  }

  function accountExists(account: Account): boolean {
    return rowsNaming(fixture.raw, 'users.id', account.id) === 1
  }

  it('deletes the account, revokes GitHub access, and signs the browser out', async () => {
    const handler = await deleteAccount()

    await expect(handler(request())).resolves.toEqual({ ok: true, github_access_revoked: true })

    expect(accountExists(OCTOCAT)).toBe(false)
    expect(accountExists(HUBOT)).toBe(true)
    expect(githubFetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((githubFetch.mock.calls[0]![1] as RequestInit).body))).toEqual({ access_token: 'gho_octocat' })
    expect(clearUserSession).toHaveBeenCalledTimes(1)
  })

  it('still deletes the account when GitHub keeps the grant', async () => {
    githubResponse = async () => new Response('{"message":"Not Found"}', { status: 404 })
    const handler = await deleteAccount()

    await expect(handler(request())).resolves.toEqual({ ok: true, github_access_revoked: false })

    expect(accountExists(OCTOCAT)).toBe(false)
    expect(clearUserSession).toHaveBeenCalledTimes(1)
  })

  it('keeps the account when the typed login names someone else', async () => {
    requestBody = { confirm_login: 'hubot' }
    const handler = await deleteAccount()

    await expect(handler(request())).rejects.toMatchObject({
      statusCode: 400,
      message: 'Type octocat to delete your account.',
    })

    expect(accountExists(OCTOCAT)).toBe(true)
    expect(githubFetch).not.toHaveBeenCalled()
    expect(clearUserSession).not.toHaveBeenCalled()
  })

  it('refuses a CLI token without a sign-in cookie', async () => {
    sessionUserId = null
    const cliToken = await issueSession(request(), OCTOCAT.id, { kind: 'pat', deviceLabel: 'laptop' })
    const bearer = { authorization: `Bearer ${cliToken.accessToken}` }
    const readAccount = (await import('../../layers/identity/server/api/me/index.get')).default
    const handler = await deleteAccount()

    // The token itself is valid: it reads the account.
    await expect(readAccount(request(bearer))).resolves.toMatchObject({ login: 'octocat' })
    await expect(handler(request(bearer))).rejects.toMatchObject({ statusCode: 403 })

    expect(accountExists(OCTOCAT)).toBe(true)
    expect(githubFetch).not.toHaveBeenCalled()
  })
})
