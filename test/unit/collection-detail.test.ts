import type { EventHandler, H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('collection detail endpoint', () => {
  let sqlite: Database.Database
  let event: H3Event
  let detailHandler: EventHandler

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, login TEXT NOT NULL, name TEXT, avatar TEXT);
      CREATE TABLE collections_v2 (
        id INTEGER PRIMARY KEY, author_user_id INTEGER, slug TEXT NOT NULL, name TEXT NOT NULL,
        preamble TEXT, featured INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER, deleted_at INTEGER
      );
      CREATE TABLE collection_skills_v2 (
        collection_id INTEGER NOT NULL, position INTEGER NOT NULL,
        owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT, reason TEXT
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, display_name TEXT,
        modified_at INTEGER, source_resolved INTEGER NOT NULL DEFAULT 0, rendered_status TEXT
      );
      CREATE TABLE repos (owner TEXT NOT NULL, repo TEXT NOT NULL, broken_since INTEGER);

      INSERT INTO users VALUES (1, 'harlan', 'Harlan', NULL);
      INSERT INTO collections_v2 VALUES (1, 1, 'stack', 'Stack', NULL, 0, 1, 1, NULL);
      INSERT INTO collections_v2 VALUES (2, 1, 'other', 'Other', NULL, 0, 1, 1, NULL);
      -- Collection 1 names one Skill and one whole repository.
      INSERT INTO collection_skills_v2 VALUES (1, 1, 'acme', 'kit', 'older', 'named');
      INSERT INTO collection_skills_v2 VALUES (1, 2, 'solo', 'hub', NULL, 'repo');
      INSERT INTO collection_skills_v2 VALUES (2, 1, 'elsewhere', 'repo', 'x', NULL);
      INSERT INTO skills VALUES ('acme', 'kit', 'older', 'Older', 100, 1, 'ok');
      INSERT INTO skills VALUES ('acme', 'kit', 'newer', 'Newer', 200, 1, 'ok');
      INSERT INTO skills VALUES ('solo', 'hub', 'stale', 'Stale', 100, 1, 'ok');
      INSERT INTO skills VALUES ('solo', 'hub', 'fresh', 'Fresh', 300, 1, 'ok');
      INSERT INTO skills VALUES ('solo', 'hub', 'unresolved', 'Unresolved', 900, 0, 'ok');
      INSERT INTO skills VALUES ('elsewhere', 'repo', 'x', 'X', 999, 1, 'ok');
      INSERT INTO repos VALUES ('acme', 'kit', NULL);
      INSERT INTO repos VALUES ('solo', 'hub', NULL);
      INSERT INTO repos VALUES ('elsewhere', 'repo', NULL);
    `)

    event = {
      method: 'GET',
      context: {
        platform: { db: wrapSqlite(sqlite) },
        params: { login: 'harlan', slug: 'stack' },
      },
      node: { req: { headers: {} } },
    } as unknown as H3Event
    vi.stubGlobal('getUserSession', () => Promise.resolve(null))
    vi.stubGlobal('getRouterParam', (_event: H3Event, key: string) => event.context.params?.[key])
    detailHandler = (await import('../../server/api/collections/by-author/[login]/[slug]/index.get')).default
  })

  afterEach(() => {
    sqlite.close()
    vi.unstubAllGlobals()
  })

  it('resolves named Skills and repository entries with resolved repo counts', async () => {
    const result = await detailHandler(event) as { skills: Array<Record<string, unknown>> }

    expect(result.skills.map(skill => ({
      position: skill.position,
      owner: skill.owner,
      repo: skill.repo,
      name: skill.name,
      displayName: skill.displayName,
      registryPath: skill.registryPath,
    }))).toEqual([
      { position: 1, owner: 'acme', repo: 'kit', name: 'older', displayName: 'Older', registryPath: '/gh/acme/kit/older' },
      { position: 2, owner: 'solo', repo: 'hub', name: 'fresh', displayName: 'Fresh', registryPath: '/gh/solo/hub/fresh' },
    ])
  })
})

function wrapSqlite(sqlite: Database.Database) {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const prepared = expandNumberedPlaceholders(sql, params)
          return {
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
