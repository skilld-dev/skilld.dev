import type { WeeklyRecipient } from '../../layers/identity/server/utils/weekly-select'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { selectWeeklyForUser } from '../../layers/identity/server/utils/weekly-select'

const HARLAN: WeeklyRecipient = { id: 1, login: 'harlan-zw', digest_email: null, email: 'h@example.com' }

describe('the weekly does not report your own work back to you', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE activity (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT, repo TEXT, name TEXT, occurred_at INTEGER, sha TEXT, message TEXT);
      CREATE TABLE skills (owner TEXT, repo TEXT, name TEXT, slug TEXT, description TEXT, current_sha TEXT, rendered_skill_path TEXT);
      CREATE TABLE repos (owner TEXT, repo TEXT, repo_kind TEXT);
      CREATE TABLE skill_likes (user_id INTEGER, owner TEXT, repo TEXT, name TEXT);
      CREATE TABLE skill_revisions (owner TEXT, repo TEXT, name TEXT, sha TEXT, modified_at INTEGER, message TEXT);
    `)
    const change = (owner: string, repo: string, name: string, at: number) => {
      sqlite.prepare('INSERT INTO activity (owner, repo, name, occurred_at, sha, message) VALUES (?,?,?,?,?,?)').run(owner, repo, name, at, `sha-${name}`, `feat: ${name}`)
      sqlite.prepare('INSERT INTO skills VALUES (?,?,?,?,?,?,?)').run(owner, repo, name, `${owner}/${repo}/${name}`, `${name} does a thing`, `sha-${name}`, `${name}/SKILL.md`)
      sqlite.prepare('INSERT INTO repos VALUES (?,?,?)').run(owner, repo, 'skills')
      sqlite.prepare('INSERT INTO skill_likes VALUES (?,?,?,?)').run(HARLAN.id, owner, repo, name)
      sqlite.prepare('INSERT INTO skill_revisions VALUES (?,?,?,?,?,?)').run(owner, repo, name, `sha-${name}`, at, `feat: ${name}`)
    }
    change('harlan-zw', 'harlan-agent-kit', 'ts-design-patterns', 500)
    change('harlan-zw', 'harlan-agent-kit', 'nuxt-frontend-design', 501)
    change('dmmulroy', 'anti-slop', 'install-anti-slop', 502)
    db = wrapSqlite(sqlite)
  })

  // The 2026-08-19 send listed four skills, and all four were the recipient's
  // own repository. A change you pushed yourself is not news.
  it('drops skills owned by the recipient', async () => {
    const selection = await selectWeeklyForUser(db, HARLAN, 0, 1000)

    expect(selection.likedChanges.map(c => `${c.owner}/${c.name}`))
      .toEqual(['dmmulroy/install-anti-slop'])
  })

  it('matches the login case-insensitively', async () => {
    const selection = await selectWeeklyForUser(db, { ...HARLAN, login: 'Harlan-ZW' }, 0, 1000)

    expect(selection.likedChanges.every(c => c.owner !== 'harlan-zw')).toBe(true)
  })

  it('still reports everyone else', async () => {
    const selection = await selectWeeklyForUser(db, { ...HARLAN, login: 'someone-else' }, 0, 1000)

    expect(selection.likedChanges).toHaveLength(3)
  })

  it('omits a row when its exact source cannot be resolved', async () => {
    sqlite.exec(`
      INSERT INTO activity (owner, repo, name, occurred_at, sha, message)
      VALUES ('unknown', 'skills', 'missing-source', 600, 'sha-missing', 'change');
      INSERT INTO skills VALUES ('unknown', 'skills', 'missing-source', 'missing-source', 'Missing source', NULL, NULL);
      INSERT INTO repos VALUES ('unknown', 'skills', 'skills');
      INSERT INTO skill_likes VALUES (1, 'unknown', 'skills', 'missing-source');
      INSERT INTO skill_revisions VALUES ('unknown', 'skills', 'missing-source', 'sha-missing', 600, 'change');
    `)

    const selection = await selectWeeklyForUser(db, HARLAN, 0, 1000)

    expect(selection.likedChanges.map(change => change.name)).not.toContain('missing-source')
  })
})

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const expanded = expandNumberedPlaceholders(sql, params)
          return {
            async run() { return sqlite.prepare(expanded.sql).run(...expanded.params) },
            async all<T>() { return { results: sqlite.prepare(expanded.sql).all(...expanded.params) as T[] } },
            async first<T>() { return (sqlite.prepare(expanded.sql).get(...expanded.params) as T | undefined) ?? null },
          }
        },
      }
    },
    batch: async <T>(statements: Array<{ all: <R>() => Promise<{ results: R[] }> }>) =>
      Promise.all(statements.map(s => s.all<T>())),
  } as unknown as D1Database
}

function expandNumberedPlaceholders(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const order: unknown[] = []
  const next = sql.replace(/\?(\d+)/g, (_, index: string) => {
    order.push(params[Number(index) - 1])
    return '?'
  })
  return order.length ? { sql: next, params: order } : { sql, params }
}
