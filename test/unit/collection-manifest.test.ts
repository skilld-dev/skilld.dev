import type { EventHandler, H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('collection manifest endpoint', () => {
  let sqlite: Database.Database
  let event: H3Event
  let manifestHandler: EventHandler

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, login TEXT NOT NULL);
      CREATE TABLE collections_v2 (
        id INTEGER PRIMARY KEY,
        author_user_id INTEGER,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        preamble TEXT,
        deleted_at INTEGER
      );
      CREATE TABLE collection_skills_v2 (
        collection_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        target_package TEXT,
        installs INTEGER NOT NULL DEFAULT 0,
        modified_at INTEGER,
        source_resolved INTEGER NOT NULL DEFAULT 0,
        rendered_status TEXT
      );
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        broken_since INTEGER
      );

      INSERT INTO users VALUES (1, 'harlan');
      INSERT INTO collections_v2 VALUES (1, 1, 'stack', 'Stack', 'Install these.', NULL);
      INSERT INTO collections_v2 VALUES (2, 1, 'empty', 'Empty', NULL, NULL);
      INSERT INTO collection_skills_v2 VALUES (1, 1, 'nuxt', 'nuxt', 'nuxt');
      INSERT INTO collection_skills_v2 VALUES (1, 2, 'other', 'repo', 'tool');
      INSERT INTO skills VALUES ('nuxt', 'nuxt', 'nuxt', 'nuxt', 0, 100, 1, 'ok');
      INSERT INTO skills VALUES ('other', 'repo', 'tool', NULL, 0, 100, 1, 'ok');
      INSERT INTO repos VALUES ('nuxt', 'nuxt', NULL);
      INSERT INTO repos VALUES ('other', 'repo', NULL);
    `)

    event = {
      method: 'GET',
      context: {
        platform: {
          db: wrapSqlite(sqlite),
        },
        params: { login: 'harlan', slug: 'stack' },
      },
      node: { req: { headers: {} } },
    } as unknown as H3Event
    vi.stubGlobal('getUserSession', () => Promise.resolve(null))
    manifestHandler = (await import('../../server/api/collections/by-author/[login]/[slug]/manifest.get')).default
  })

  afterEach(() => {
    sqlite.close()
    vi.unstubAllGlobals()
  })

  it('returns CLI install items with npm fast-path matches first', async () => {
    vi.stubGlobal('getRouterParam', (_event: H3Event, key: string) => event.context.params?.[key])

    const result = await manifestHandler(event) as { name: string, preamble: string, items: unknown[] }

    expect(result).toEqual({
      name: 'Stack',
      preamble: 'Install these.',
      items: [
        { kind: 'npm', package: 'nuxt' },
        { kind: 'gh', owner: 'other', repo: 'repo', name: 'tool' },
      ],
    })
  })

  it('returns an empty manifest for existing empty collections', async () => {
    event.context.params = { login: 'harlan', slug: 'empty' }
    vi.stubGlobal('getRouterParam', (_event: H3Event, key: string) => event.context.params?.[key])

    await expect(manifestHandler(event)).resolves.toEqual({
      name: 'Empty',
      preamble: undefined,
      items: [],
    })
  })
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
