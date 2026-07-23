import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { selectDigestForUser, shouldFireForUser } from '../../layers/identity/server/utils/digest-select'

describe('digest selection', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE activity (
        id INTEGER PRIMARY KEY,
        owner TEXT,
        repo TEXT,
        name TEXT,
        occurred_at INTEGER,
        ingested_at INTEGER,
        sha TEXT
      );
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
        sha TEXT,
        modified_at INTEGER,
        message TEXT,
        PRIMARY KEY (owner, repo, name, sha)
      );

      INSERT INTO skills VALUES ('nuxt', 'nuxt', 'nuxt', 'Nuxt framework');
      INSERT INTO repos VALUES ('nuxt', 'nuxt', 'source');
      INSERT INTO skill_subscriptions VALUES (1, 'nuxt', 'nuxt', NULL);
      INSERT INTO activity VALUES (1, 'nuxt', 'nuxt', 'nuxt', 500, 1500, 'blob-old');
      INSERT INTO activity VALUES (2, 'nuxt', 'nuxt', 'nuxt', 1500, 1600, 'blob-new');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'nuxt', 'commit-old', 500, 'old change');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'nuxt', 'commit-new', 1500, 'new change');
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('selects an explicit durable activity cursor window', async () => {
    const selection = await selectDigestForUser(db, digestUser(), 2000, {
      windowStart: 1000,
      cursorStart: 1,
      cursorEnd: 2,
    })

    expect(selection?.windowStart).toBe(1000)
    expect(selection?.cursorStart).toBe(1)
    expect(selection?.cursorEnd).toBe(2)
    expect(selection?.entries[0]?.changeCount).toBe(1)
    expect(selection?.entries[0]?.skills[0]?.commitMessages).toEqual(['new change'])
    expect(selection?.entries[0]).not.toHaveProperty('skillName')
    expect(selection?.entries[0]).not.toHaveProperty('description')
    expect(selection?.entries[0]).not.toHaveProperty('commitCount')
    expect(selection?.entries[0]).not.toHaveProperty('commitMessages')
  })

  it('derives CLI cursor bounds from ingestion time', async () => {
    const selection = await selectDigestForUser(db, digestUser(), 2000, { windowStart: 0 })

    expect(selection?.windowStart).toBe(0)
    expect(selection?.cursorStart).toBe(0)
    expect(selection?.cursorEnd).toBe(2)
    expect(selection?.entries[0]?.changeCount).toBe(2)
    expect(selection?.entries[0]?.skills[0]?.commitMessages).toEqual(['new change', 'old change'])
  })

  it('retains sorted skill names and per-skill counts for a multi-skill repo', async () => {
    sqlite.exec(`
      INSERT INTO skills VALUES ('nuxt', 'nuxt', 'zeta', 'Zeta helper');
      INSERT INTO activity VALUES (3, 'nuxt', 'nuxt', 'zeta', 100, 1700, 'blob-z1');
      INSERT INTO activity VALUES (4, 'nuxt', 'nuxt', 'zeta', 101, 1701, 'blob-z2');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'zeta', 'commit-z1', 100, 'zeta first');
      INSERT INTO skill_revisions VALUES ('nuxt', 'nuxt', 'zeta', 'commit-z2', 101, 'zeta second');
    `)

    const selection = await selectDigestForUser(db, digestUser(), 2000, {
      windowStart: 0,
      cursorStart: 0,
      cursorEnd: 4,
    })

    expect(selection?.entries[0]).toMatchObject({
      skillNames: ['nuxt', 'zeta'],
      changeCount: 4,
      skills: [
        { name: 'nuxt', changeCount: 2, commitMessages: ['new change', 'old change'] },
        { name: 'zeta', changeCount: 2, commitMessages: ['zeta second', 'zeta first'] },
      ],
    })
  })

  it('keeps a due user without a recipient eligible for visible preflight failure', () => {
    const dueAt = Date.UTC(2026, 6, 23, 9, 0, 0) / 1_000
    expect(shouldFireForUser(digestUser({
      digest_email: null,
      email: null,
      digest_frequency: 'daily',
      onboarded_at: 1,
    }), dueAt)).toBe(true)
  })
})

function digestUser(overrides: Partial<ReturnType<typeof baseDigestUser>> = {}) {
  return { ...baseDigestUser(), ...overrides }
}

function baseDigestUser() {
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
