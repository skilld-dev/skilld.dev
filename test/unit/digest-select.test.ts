import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { selectDigestForUser } from '../../layers/identity/server/utils/digest-select'

describe('digest selection', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE digest_runs (user_id INTEGER, window_end INTEGER);
      CREATE TABLE activity (owner TEXT, repo TEXT, name TEXT, occurred_at INTEGER);
      CREATE TABLE skills (
        owner TEXT,
        repo TEXT,
        name TEXT,
        description TEXT
      );
      CREATE TABLE repos (
        owner TEXT,
        repo TEXT,
        repo_kind TEXT
      );
      CREATE TABLE skill_subscriptions (
        user_id INTEGER,
        owner TEXT,
        repo TEXT,
        muted_until INTEGER
      );
      CREATE TABLE skill_revisions (
        owner TEXT,
        repo TEXT,
        name TEXT,
        message TEXT,
        modified_at INTEGER
      );

      INSERT INTO digest_runs VALUES (1, 1000);
      INSERT INTO skills VALUES ('nuxt', 'nuxt', 'nuxt', 'Nuxt framework');
      INSERT INTO repos VALUES ('nuxt', 'nuxt', 'source');
      INSERT INTO skill_subscriptions VALUES (1, 'nuxt', 'nuxt', NULL);
      INSERT INTO activity VALUES ('nuxt', 'nuxt', 'nuxt', 500);
      INSERT INTO activity VALUES ('nuxt', 'nuxt', 'nuxt', 1500);
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'nuxt', 'old change', 500);
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'nuxt', 'new change', 1500);
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('defaults email windows to the last digest run', async () => {
    const selection = await selectDigestForUser(db, digestUser(), 2000)

    expect(selection?.windowStart).toBe(1000)
    expect(selection?.entries[0]?.commitCount).toBe(1)
    expect(selection?.entries[0]?.commitMessages).toEqual(['new change'])
  })

  it('lets CLI callers override the window start from since=', async () => {
    const selection = await selectDigestForUser(db, digestUser(), 2000, { windowStart: 0 })

    expect(selection?.windowStart).toBe(0)
    expect(selection?.entries[0]?.commitCount).toBe(2)
    expect(selection?.entries[0]?.commitMessages).toEqual(['new change', 'old change'])
  })
})

function digestUser() {
  return {
    id: 1,
    login: 'harlan',
    digest_email: 'harlan@example.com',
    email: 'harlan@example.com',
    email_opt_in: 1,
    digest_frequency: 'weekly' as const,
    digest_dow: 1,
    digest_hour: 9,
    timezone: 'UTC',
    onboarded_at: 0,
  }
}

function wrapSqlite(sqlite: Database.Database): D1Database {
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
    batch: async <T>(statements: Array<{ all: <R>() => Promise<{ results: R[] }> }>) => {
      return Promise.all(statements.map(statement => statement.all<T>()))
    },
  } as unknown as D1Database
}

function expandNumberedPlaceholders(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
