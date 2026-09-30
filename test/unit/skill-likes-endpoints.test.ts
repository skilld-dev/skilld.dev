import type { EventHandler, H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SIGNED_IN_HEADERS } from './helpers/session'

const NOW = new Date('2026-08-10T09:00:00.000Z')
const NOW_SEC = Math.floor(NOW.getTime() / 1000)

interface SubRow { owner: string, repo: string, source: string }

describe('skill likes endpoints', () => {
  let sqlite: Database.Database
  let likeHandler: EventHandler
  let unlikeHandler: EventHandler
  let listHandler: EventHandler

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))

    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER UNIQUE NOT NULL,
        login TEXT NOT NULL,
        name TEXT,
        email TEXT,
        avatar TEXT,
        digest_email TEXT,
        email_opt_in INTEGER NOT NULL DEFAULT 0,
        weekly_opt_out INTEGER NOT NULL DEFAULT 0,
        digest_frequency TEXT NOT NULL DEFAULT 'weekly',
        digest_dow INTEGER DEFAULT 1,
        digest_hour INTEGER NOT NULL DEFAULT 9,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        stars_synced_at INTEGER,
        onboarded_at INTEGER,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL,
        likes_public INTEGER NOT NULL DEFAULT 1,
        repo_indexing INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE skill_likes (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo, name)
      );
      CREATE TABLE skill_subscriptions (
        user_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        source TEXT NOT NULL,
        muted_until INTEGER,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo)
      );
      CREATE TABLE skill_dirty (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        reason TEXT NOT NULL,
        queued_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner, repo, name, reason)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        like_count INTEGER NOT NULL DEFAULT 0,
        source_resolved INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER,
        PRIMARY KEY (owner, repo)
      );
      INSERT INTO users (id, github_id, login, created_at, last_login_at)
      VALUES (1, 123, 'harlan', 1, 1);
      INSERT INTO skills (owner, repo, name, slug, description) VALUES
        ('nuxt', 'ui', 'design-tokens', 'nuxt/ui/design-tokens', 'Tokens'),
        ('nuxt', 'ui', 'motion', 'nuxt/ui/motion', 'Motion');
      INSERT INTO repos (owner, repo, stars) VALUES ('nuxt', 'ui', 4200);
    `)

    likeHandler = (await import('../../layers/identity/server/api/me/likes/index.post')).default
    unlikeHandler = (await import('../../layers/identity/server/api/me/likes/[owner]/[repo]/[name].delete')).default
    listHandler = (await import('../../layers/identity/server/api/me/likes/index.get')).default
  })

  afterEach(() => {
    sqlite.close()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('records the like and derives a repo subscription', async () => {
    const result = await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))

    expect(likes()).toEqual([{ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }])
    expect(subs()).toEqual([{ owner: 'nuxt', repo: 'ui', source: 'like' }])
    expect(dirtyReasons()).toEqual(['like'])
    expect(result).toEqual({ ok: true, likeCount: 1 })
  })

  it('is idempotent on a repeat like', async () => {
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
    const result = await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))

    expect(likes()).toHaveLength(1)
    expect(subs()).toHaveLength(1)
    expect(result).toEqual({ ok: true, likeCount: 1 })
  })

  it('leaves the existing subscription alone when a second skill in the repo is liked', async () => {
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
    const createdAt = subCreatedAt()
    vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))

    expect(likes()).toHaveLength(2)
    expect(subs()).toHaveLength(1)
    expect(subCreatedAt()).toBe(createdAt)
  })

  it('keeps the subscription while any sibling skill in the repo is still liked', async () => {
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))

    const result = await unlikeHandler(unlikeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))

    expect(likes()).toEqual([{ owner: 'nuxt', repo: 'ui', name: 'motion' }])
    expect(subs()).toEqual([{ owner: 'nuxt', repo: 'ui', source: 'like' }])
    expect(result).toEqual({ ok: true, likeCount: 0 })
  })

  it('drops the subscription when the last liked skill in the repo goes', async () => {
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))

    await unlikeHandler(unlikeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
    await unlikeHandler(unlikeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))

    expect(likes()).toEqual([])
    expect(subs()).toEqual([])
  })

  it.each(['manual', 'star-import', 'collection:essentials'])(
    'never downgrades or removes a %s subscription',
    async (source) => {
      sqlite.prepare(
        `INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES (1, 'nuxt', 'ui', ?, ?)`,
      ).run(source, NOW_SEC - 500)

      await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
      expect(subs()).toEqual([{ owner: 'nuxt', repo: 'ui', source }])

      await unlikeHandler(unlikeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
      expect(likes()).toEqual([])
      expect(subs()).toEqual([{ owner: 'nuxt', repo: 'ui', source }])
    },
  )

  it('only touches the acting user', async () => {
    sqlite.prepare(`INSERT INTO users (id, github_id, login, created_at, last_login_at) VALUES (2, 456, 'other', 1, 1)`).run()
    sqlite.prepare(`INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (2, 'nuxt', 'ui', 'motion', ?)`).run(NOW_SEC)
    sqlite.prepare(`INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at) VALUES (2, 'nuxt', 'ui', 'like', ?)`).run(NOW_SEC)

    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))
    await unlikeHandler(unlikeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))

    expect(sqlite.prepare(`SELECT COUNT(*) FROM skill_likes WHERE user_id = 2`).pluck().get()).toBe(1)
    expect(sqlite.prepare(`SELECT COUNT(*) FROM skill_subscriptions WHERE user_id = 2`).pluck().get()).toBe(1)
  })

  it('rejects the like past the daily cap, and lets it through once the window rolls', async () => {
    const { MAX_LIKES_PER_DAY } = await import('../../layers/identity/server/utils/likes')
    const insert = sqlite.prepare(
      `INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (1, 'bulk', 'repo', ?, ?)`,
    )
    for (let i = 0; i < MAX_LIKES_PER_DAY; i++)
      insert.run(`skill-${i}`, NOW_SEC - 10)

    await expect(likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' })))
      .rejects
      .toMatchObject({ statusCode: 429 })

    vi.setSystemTime(new Date(NOW.getTime() + 86_401_000))
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))
    expect(sqlite.prepare(`SELECT COUNT(*) FROM skill_likes WHERE user_id = 1 AND owner = 'nuxt'`).pluck().get()).toBe(1)
  })

  it('rejects an unlike missing a path segment', async () => {
    await expect(unlikeHandler(unlikeEvent({ owner: 'nuxt', repo: 'ui', name: '' })))
      .rejects
      .toMatchObject({ statusCode: 400 })
  })

  it('lists the caller likes newest first with card fields joined in', async () => {
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'design-tokens' }))
    vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    await likeHandler(likeEvent({ owner: 'nuxt', repo: 'ui', name: 'motion' }))

    const result = await listHandler(baseEvent()) as { items: Array<Record<string, unknown>> }

    expect(result.items.map(i => i.name)).toEqual(['motion', 'design-tokens'])
    expect(result.items[0]).toMatchObject({ slug: 'nuxt/ui/motion', description: 'Motion', stars: 4200, likeCount: 1 })
  })

  function likes() {
    return sqlite.prepare(`SELECT owner, repo, name FROM skill_likes WHERE user_id = 1 ORDER BY name`).all()
  }

  function subs(): SubRow[] {
    return sqlite.prepare(`SELECT owner, repo, source FROM skill_subscriptions WHERE user_id = 1 ORDER BY repo`).all() as SubRow[]
  }

  function subCreatedAt() {
    return sqlite.prepare(`SELECT created_at FROM skill_subscriptions WHERE user_id = 1`).pluck().get()
  }

  function dirtyReasons() {
    return sqlite.prepare(`SELECT DISTINCT reason FROM skill_dirty`).pluck().all()
  }

  function baseEvent(): H3Event {
    return {
      method: 'GET',
      context: { platform: { db: wrapSqlite(sqlite) }, user: { id: 1, login: 'harlan' } },
      node: { req: { headers: { ...SIGNED_IN_HEADERS } } },
    } as unknown as H3Event
  }

  function likeEvent(body: { owner: string, repo: string, name: string }): H3Event {
    vi.stubGlobal('readBody', () => Promise.resolve(body))
    vi.stubGlobal('getUserSession', () => Promise.resolve({ user: { id: 1, login: 'harlan' } }))
    const event = baseEvent()
    ;(event as unknown as { method: string }).method = 'POST'
    return event
  }

  function unlikeEvent(params: { owner: string, repo: string, name: string }): H3Event {
    vi.stubGlobal('getUserSession', () => Promise.resolve({ user: { id: 1, login: 'harlan' } }))
    vi.stubGlobal('getRouterParam', (_e: H3Event, key: string) => params[key as keyof typeof params])
    const event = baseEvent()
    ;(event as unknown as { method: string }).method = 'DELETE'
    return event
  }
})

function wrapSqlite(sqlite: Database.Database) {
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const prepared = expandNumberedPlaceholders(sql, params)
          return {
            _run: () => sqlite.prepare(prepared.sql).run(...prepared.params),
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
    // D1 runs a batch sequentially inside an implicit transaction. The
    // subscription cleanup in unlikeSkill depends on that ordering.
    async batch(stmts: Array<{ _run: () => unknown }>) {
      const tx = sqlite.transaction(() => stmts.map(s => s._run()))
      return tx()
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
