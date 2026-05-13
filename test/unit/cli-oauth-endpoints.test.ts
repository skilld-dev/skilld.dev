import type { EventHandler, H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256Base64Url } from '../../layers/identity/server/utils/cli-tokens'

const TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))
const NOW = new Date('2026-05-13T04:10:00.000Z')

describe('cli OAuth token endpoint', () => {
  let sqlite: Database.Database
  let event: H3Event
  let tokenHandler: EventHandler

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.NUXT_TOKEN_KEY = TOKEN_KEY
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)

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
        digest_frequency TEXT NOT NULL DEFAULT 'weekly',
        digest_dow INTEGER DEFAULT 1,
        digest_hour INTEGER NOT NULL DEFAULT 9,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        onboarded_at INTEGER,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL
      );
      CREATE TABLE cli_auth_codes (
        code TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        code_challenge TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT 'cli',
        cli_version TEXT,
        redirect_port INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE cli_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
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
      INSERT INTO users (id, github_id, login, name, email, avatar, created_at, last_login_at)
      VALUES (1, 123, 'harlan', 'Harlan', 'harlan@example.com', NULL, 1, 1);
    `)

    event = makeEvent()
    tokenHandler = (await import('../../layers/identity/server/api/cli/oauth/token.post')).default
  })

  afterEach(() => {
    sqlite.close()
    delete process.env.NUXT_TOKEN_KEY
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('exchanges a valid PKCE auth code once', async () => {
    const verifier = 'a'.repeat(64)
    await insertCode({ code: 'code-valid-123456', challenge: await sha256Base64Url(verifier), port: 49152 })

    setBody({
      code: 'code-valid-123456',
      code_verifier: verifier,
      redirect_uri: 'http://127.0.0.1:49152/',
    })

    const result = await tokenHandler(event) as { accessToken: string, refreshToken: string, login: string }

    expect(result.login).toBe('harlan')
    expect(result.accessToken.split('.')).toHaveLength(3)
    expect(result.refreshToken).toBeTruthy()
    expect(sqlite.prepare('SELECT used_at FROM cli_auth_codes WHERE code = ?').get('code-valid-123456')).toMatchObject({
      used_at: Math.floor(NOW.getTime() / 1000),
    })

    await expect(tokenHandler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects verifier and redirect_uri mismatches without burning the code', async () => {
    const verifier = 'b'.repeat(64)
    await insertCode({ code: 'code-bad-12345678', challenge: await sha256Base64Url(verifier), port: 49153 })

    setBody({
      code: 'code-bad-12345678',
      code_verifier: 'c'.repeat(64),
      redirect_uri: 'http://127.0.0.1:49153/',
    })
    await expect(tokenHandler(event)).rejects.toMatchObject({ statusCode: 401 })

    setBody({
      code: 'code-bad-12345678',
      code_verifier: verifier,
      redirect_uri: 'http://127.0.0.1:49154/',
    })
    await expect(tokenHandler(event)).rejects.toMatchObject({ statusCode: 400 })

    expect(sqlite.prepare('SELECT used_at FROM cli_auth_codes WHERE code = ?').get('code-bad-12345678')).toMatchObject({
      used_at: null,
    })
  })

  async function insertCode(input: { code: string, challenge: string, port: number }) {
    sqlite.prepare(`
      INSERT INTO cli_auth_codes (
        code, user_id, code_challenge, scopes, cli_version,
        redirect_port, state, created_at, expires_at
      ) VALUES (?, 1, ?, 'cli', '2.0.0', ?, 'state', ?, ?)
    `).run(
      input.code,
      input.challenge,
      input.port,
      Math.floor(NOW.getTime() / 1000),
      Math.floor(NOW.getTime() / 1000) + 300,
    )
  }

  function makeEvent(): H3Event {
    return {
      method: 'POST',
      context: {
        platform: {
          db: wrapSqlite(sqlite),
        },
      },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }

  function setBody(body: unknown) {
    vi.stubGlobal('readBody', () => Promise.resolve(body))
    vi.stubGlobal('getUserSession', () => Promise.resolve(null))
  }
})

function wrapSqlite(sqlite: Database.Database) {
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
