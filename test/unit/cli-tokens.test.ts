import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBearerSession } from '../../layers/identity/server/utils/bearer'
import {
  issueSession,
  revokeSession,
  rotateSession,
  sha256Base64Url,
  verifyAccessToken,
} from '../../layers/identity/server/utils/cli-tokens'

const TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
const NOW = new Date('2026-05-13T04:00:00.000Z')

interface D1Like {
  prepare: (sql: string) => {
    bind: (...params: unknown[]) => {
      run: () => Promise<unknown>
      all: <T>() => Promise<{ results: T[] }>
      first: <T>() => Promise<T | null>
    }
  }
}

describe('cli token sessions', () => {
  let sqlite: Database.Database
  let db: D1Like
  let event: H3Event

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.NUXT_TOKEN_KEY = TOKEN_KEY
    vi.stubGlobal('useRuntimeConfig', () => ({ tokenKey: TOKEN_KEY }))
    vi.stubGlobal('createError', (input: { statusCode: number, message: string }) => {
      const error = new Error(input.message) as Error & { statusCode: number }
      error.statusCode = input.statusCode
      return error
    })

    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER UNIQUE NOT NULL,
        login TEXT NOT NULL,
        name TEXT,
        email TEXT,
        digest_email TEXT,
        digest_email_pending TEXT,
        digest_email_token_hash TEXT,
        digest_email_token_expires_at INTEGER,
        avatar TEXT,
        github_token_encrypted TEXT,
        github_token_scopes TEXT,
        stars_synced_at INTEGER,
        email_opt_in INTEGER NOT NULL DEFAULT 0,
        weekly_opt_out INTEGER NOT NULL DEFAULT 0,
        digest_frequency TEXT NOT NULL DEFAULT 'weekly',
        digest_dow INTEGER DEFAULT 1,
        digest_hour INTEGER NOT NULL DEFAULT 9,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        onboarded_at INTEGER,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL,
        likes_public INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE cli_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_hash TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        prev_refresh_hash TEXT,
        prev_refresh_expires_at INTEGER,
        kind TEXT NOT NULL CHECK (kind IN ('oauth','pat','oidc')),
        scopes TEXT NOT NULL DEFAULT 'cli',
        device_label TEXT,
        cli_version TEXT,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        expires_at INTEGER,
        revoked_at INTEGER
      );
      CREATE INDEX idx_cli_tokens_user ON cli_tokens(user_id, revoked_at);
      CREATE UNIQUE INDEX idx_cli_tokens_refresh
        ON cli_tokens(refresh_hash) WHERE revoked_at IS NULL;
      INSERT INTO users (id, github_id, login, name, email, avatar, created_at, last_login_at)
      VALUES (1, 123, 'harlan', 'Harlan', 'harlan@example.com', 'https://example.com/a.png', 1, 1);
    `)
    db = wrapSqlite(sqlite)
    event = {
      context: {
        platform: { db },
      },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  })

  afterEach(() => {
    sqlite.close()
    delete process.env.NUXT_TOKEN_KEY
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('issues refresh-backed OAuth sessions and verifies access tokens', async () => {
    const session = await issueSession(event, 1, { kind: 'oauth', cliVersion: '2.0.0' })

    expect(session.accessToken.split('.')).toHaveLength(3)
    expect(session.refreshToken).toBeTruthy()
    expect(session.scopes).toBe('cli')

    const row = sqlite.prepare('SELECT * FROM cli_tokens').get() as { refresh_hash: string, refresh_token_encrypted: string, cli_version: string }
    expect(row.refresh_hash).toBe(await sha256Base64Url(session.refreshToken!))
    expect(row.refresh_hash).not.toBe(session.refreshToken)
    expect(row.refresh_token_encrypted).not.toContain(session.refreshToken!)
    expect(row.cli_version).toBe('2.0.0')

    await expect(verifyAccessToken(event, session.accessToken)).resolves.toEqual({
      tokenId: 1,
      userId: 1,
      scopes: 'cli',
    })
  })

  it('rotates refresh tokens and returns the active pair for old-token grace retries', async () => {
    const first = await issueSession(event, 1, { kind: 'oauth' })
    const rotated = await rotateSession(event, first.refreshToken!)

    expect(rotated?.refreshToken).toBeTruthy()
    expect(rotated?.refreshToken).not.toBe(first.refreshToken)

    const grace = await rotateSession(event, first.refreshToken!)
    expect(grace?.refreshToken).toBe(rotated?.refreshToken)

    const row = sqlite.prepare('SELECT prev_refresh_hash, prev_refresh_expires_at FROM cli_tokens').get() as {
      prev_refresh_hash: string
      prev_refresh_expires_at: number
    }
    expect(row.prev_refresh_hash).toBe(await sha256Base64Url(first.refreshToken!))
    expect(row.prev_refresh_expires_at).toBe(Math.floor(NOW.getTime() / 1000) + 30)
  })

  it('rejects old refresh tokens after grace expires', async () => {
    const first = await issueSession(event, 1, { kind: 'oauth' })
    const rotated = await rotateSession(event, first.refreshToken!)

    vi.setSystemTime(new Date(NOW.getTime() + 31_000))

    await expect(rotateSession(event, first.refreshToken!)).resolves.toBeNull()
    await expect(rotateSession(event, rotated!.refreshToken!)).resolves.toMatchObject({ scopes: 'cli' })
  })

  it('revokes by token id and by refresh token', async () => {
    const first = await issueSession(event, 1, { kind: 'oauth' })
    await revokeSession(event, 1)

    await expect(verifyAccessToken(event, first.accessToken)).resolves.toBeNull()

    const second = await issueSession(event, 1, { kind: 'oauth' })
    await revokeSession(event, second.refreshToken!)

    await expect(rotateSession(event, second.refreshToken!)).resolves.toBeNull()
  })

  it('issues non-refresh PAT access tokens', async () => {
    const pat = await issueSession(event, 1, {
      kind: 'pat',
      scopes: 'cli',
      deviceLabel: 'ci',
      ttlSec: 60,
      refresh: false,
    })

    expect(pat.refreshToken).toBeUndefined()
    await expect(verifyAccessToken(event, pat.accessToken)).resolves.toMatchObject({ userId: 1, scopes: 'cli' })

    vi.setSystemTime(new Date(NOW.getTime() + 61_000))
    await expect(verifyAccessToken(event, pat.accessToken)).resolves.toBeNull()
  })

  it('resolves bearer sessions into the user context shape used by policies', async () => {
    const session = await issueSession(event, 1, { kind: 'oauth' })
    ;(event.node.req.headers as Record<string, string>).authorization = `Bearer ${session.accessToken}`

    const user = await resolveBearerSession(event)

    expect(user).toMatchObject({
      id: 1,
      githubId: 123,
      login: 'harlan',
      scopes: ['cli'],
      cliTokenId: 1,
    })
    expect(event.context.user).toMatchObject({ id: 1, login: 'harlan' })
  })
})

function wrapSqlite(sqlite: Database.Database): D1Like {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const prepared = expandNumberedPlaceholders(sql, params)
          return {
            async run() {
              return sqlite.prepare(prepared.sql).run(...prepared.params)
            },
            async all<T>() {
              return { results: sqlite.prepare(prepared.sql).all(...prepared.params) as T[] }
            },
            async first<T>() {
              return (sqlite.prepare(prepared.sql).get(...prepared.params) as T | undefined) ?? null
            },
          }
        },
      }
    },
  }
}

function expandNumberedPlaceholders(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
