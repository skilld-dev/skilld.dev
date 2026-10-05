import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * An anonymous heart click bounces through GitHub OAuth carrying ?action=like-skill.
 * If the callback fails to replay it the user lands back on the skill with an
 * empty heart and no idea why — the exact bug the deleted "Save to collection"
 * popover shipped with (it emitted add-to-collection, which nothing handled).
 */
describe('post-OAuth like replay', () => {
  let sqlite: Database.Database
  let handleWatchAction: typeof import('../../layers/identity/server/utils/watch-actions')['handleWatchAction']

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T09:00:00.000Z'))
    vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))

    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE skill_likes (
        user_id INTEGER NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL,
        name TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo, name)
      );
      CREATE TABLE skill_subscriptions (
        user_id INTEGER NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL,
        source TEXT NOT NULL, muted_until INTEGER, created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo)
      );
      CREATE TABLE skill_dirty (
        owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL,
        reason TEXT NOT NULL, queued_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner, repo, name, reason)
      );
      CREATE TABLE collection_skills_v2 (collection_id INTEGER, owner TEXT, repo TEXT, name TEXT);
      CREATE TABLE collections_v2 (id INTEGER PRIMARY KEY, slug TEXT, author_user_id INTEGER, deleted_at INTEGER);
      CREATE TABLE users (id INTEGER PRIMARY KEY, login TEXT);
      CREATE TABLE repos (owner TEXT, repo TEXT, PRIMARY KEY (owner, repo));
      INSERT INTO repos VALUES ('nuxt', 'ui');
    `)

    handleWatchAction = (await import('../../layers/identity/server/utils/watch-actions')).handleWatchAction
  })

  afterEach(() => {
    sqlite.close()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('replays a like from the skill path, deriving the repo subscription', async () => {
    await handleWatchAction(event(), 1, 'like-skill', '/gh/nuxt/ui/design-tokens')

    expect(likes()).toEqual([{ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }])
    expect(subs()).toEqual([{ owner: 'nuxt', repo: 'ui', source: 'like' }])
  })

  it('replays a like when the return path carries a query string or hash', async () => {
    await handleWatchAction(event(), 1, 'like-skill', '/gh/nuxt/ui/motion?from=search#install')

    expect(likes()).toEqual([{ owner: 'nuxt', repo: 'ui', name: 'motion' }])
  })

  it('does nothing when the path has no skill name to like', async () => {
    await handleWatchAction(event(), 1, 'like-skill', '/gh/nuxt/ui')

    expect(likes()).toEqual([])
    expect(subs()).toEqual([])
  })

  it('still supports watch-skill from a repo path with no skill segment', async () => {
    await handleWatchAction(event(), 1, 'watch-skill', '/gh/nuxt/ui')

    expect(likes()).toEqual([])
    expect(subs()).toEqual([{ owner: 'nuxt', repo: 'ui', source: 'manual' }])
  })

  function likes() {
    return sqlite.prepare(`SELECT owner, repo, name FROM skill_likes ORDER BY name`).all()
  }

  function subs() {
    return sqlite.prepare(`SELECT owner, repo, source FROM skill_subscriptions ORDER BY repo`).all()
  }

  function event(): H3Event {
    return { context: { platform: { db: wrapSqlite(sqlite) } } } as unknown as H3Event
  }
})

function wrapSqlite(sqlite: Database.Database) {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const prepared = expandNumberedPlaceholders(sql, params)
          return {
            _run: () => /^\s*SELECT/i.test(prepared.sql)
              ? { results: sqlite.prepare(prepared.sql).all(...prepared.params) }
              : { meta: { changes: sqlite.prepare(prepared.sql).run(...prepared.params).changes } },
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
    async batch(stmts: Array<{ _run: () => unknown }>) {
      return sqlite.transaction(() => stmts.map(s => s._run()))()
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
