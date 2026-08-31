import type { EventHandler, H3Event } from 'h3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { identityEmailPatchBodySchema } from '../../layers/identity/shared/contracts/account'

const migrationPath = resolve(process.cwd(), 'migrations/0082_digest_opt_in_requires_address.sql')

describe('digest opt-in requires a deliverable address', () => {
  it('rejects opting in without an address', () => {
    const result = identityEmailPatchBodySchema.safeParse({ email_opt_in: true })
    expect(result.success).toBe(false)
  })

  it('rejects opting in with a blank address', () => {
    const result = identityEmailPatchBodySchema.safeParse({ digest_email: '   ', email_opt_in: true })
    expect(result.success).toBe(false)
  })

  it('rejects opting in with a malformed address', () => {
    const result = identityEmailPatchBodySchema.safeParse({ digest_email: 'not-an-email', email_opt_in: true })
    expect(result.success).toBe(false)
  })

  it('accepts opting in with an address and normalises it', () => {
    expect(identityEmailPatchBodySchema.parse({ digest_email: '  Harlan@Example.COM ', email_opt_in: true })).toEqual({
      digest_email: 'harlan@example.com',
      email_opt_in: true,
    })
  })

  it('accepts opting out without an address', () => {
    expect(identityEmailPatchBodySchema.parse({ email_opt_in: false })).toEqual({ email_opt_in: false })
  })

  it('requires an address for the weekly email too', () => {
    expect(identityEmailPatchBodySchema.safeParse({ weekly_opt_in: true }).success).toBe(false)
    expect(identityEmailPatchBodySchema.parse({ weekly_opt_in: false })).toEqual({ weekly_opt_in: false })
  })

  it('accepts both independent email choices with one address', () => {
    expect(identityEmailPatchBodySchema.parse({
      digest_email: 'harlan@example.com',
      email_opt_in: false,
      weekly_opt_in: true,
    })).toEqual({
      digest_email: 'harlan@example.com',
      email_opt_in: false,
      weekly_opt_in: true,
    })
  })

  // A lone blank address used to parse through and null the stored one,
  // which silently disabled delivery for anyone already opted in.
  it('treats a blank address as unchanged, not as clearing it', () => {
    expect(identityEmailPatchBodySchema.parse({ digest_email: '' })).toEqual({})
    expect(identityEmailPatchBodySchema.parse({ digest_email: '   ' })).toEqual({})
  })

  it('still refuses a blank address when the request opts in', () => {
    expect(identityEmailPatchBodySchema.safeParse({ digest_email: '', email_opt_in: true }).success).toBe(false)
    expect(identityEmailPatchBodySchema.safeParse({ digest_email: '   ', weekly_opt_in: true }).success).toBe(false)
  })

  it('repairs opted-in users that have no deliverable address', () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          login TEXT NOT NULL,
          email TEXT,
          digest_email TEXT,
          email_opt_in INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO users (id, login, email, digest_email, email_opt_in) VALUES
          (1, 'no-address', NULL, NULL, 1),
          (2, 'blank-address', '', '   ', 1),
          (3, 'digest-address', NULL, 'digest@example.com', 1),
          (4, 'github-address', 'github@example.com', NULL, 1),
          (5, 'already-out', NULL, NULL, 0);
      `)

      sqlite.exec(readFileSync(migrationPath, 'utf8'))

      expect(sqlite.prepare(`SELECT id, email_opt_in FROM users ORDER BY id`).all()).toEqual([
        { id: 1, email_opt_in: 0 },
        { id: 2, email_opt_in: 0 },
        { id: 3, email_opt_in: 1 },
        { id: 4, email_opt_in: 1 },
        { id: 5, email_opt_in: 0 },
      ])
    }
    finally {
      sqlite.close()
    }
  })
})

describe('me email patch endpoint', () => {
  let sqlite: Database.Database
  let emailPatchHandler: EventHandler

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
    vi.stubGlobal('getUserSession', () => Promise.resolve({ user: { id: 1, login: 'harlan' } }))

    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        github_id INTEGER UNIQUE NOT NULL,
        login TEXT NOT NULL,
        name TEXT,
        email TEXT,
        avatar TEXT,
        digest_email TEXT,
        email_opt_in INTEGER NOT NULL DEFAULT 0,
        weekly_opt_out INTEGER NOT NULL DEFAULT 0,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        stars_synced_at INTEGER,
        onboarded_at INTEGER,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL
      );
      INSERT INTO users (
        id, github_id, login, digest_email, email_opt_in, onboarded_at,
        created_at, last_login_at
      ) VALUES (1, 123, 'harlan', 'harlan@example.com', 1, 1, 1, 1);
    `)

    emailPatchHandler = (await import('../../layers/identity/server/api/me/email.patch')).default
  })

  afterEach(() => {
    sqlite.close()
    vi.unstubAllGlobals()
  })

  it('keeps the stored address when an opted-in caller patches a blank one', async () => {
    vi.stubGlobal('readBody', () => Promise.resolve({ digest_email: '' }))

    await emailPatchHandler(patchEvent())

    expect(sqlite.prepare(`SELECT digest_email, email_opt_in FROM users WHERE id = 1`).get())
      .toEqual({ digest_email: 'harlan@example.com', email_opt_in: 1 })
  })

  it('still saves a real address and unchanged weekly choice', async () => {
    vi.stubGlobal('readBody', () => Promise.resolve({ digest_email: 'New@Example.COM' }))

    await emailPatchHandler(patchEvent())

    expect(sqlite.prepare(`SELECT digest_email, email_opt_in, weekly_opt_out FROM users WHERE id = 1`).get())
      .toEqual({ digest_email: 'new@example.com', email_opt_in: 1, weekly_opt_out: 0 })
  })

  function patchEvent(): H3Event {
    return {
      method: 'PATCH',
      context: { platform: { db: wrapSqlite(sqlite) }, user: { id: 1, login: 'harlan' } },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }
})

function wrapSqlite(sqlite: Database.Database) {
  const db = {
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
  return db
}

function expandNumberedPlaceholders(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
