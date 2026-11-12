import type { SkillSourceBucket } from './skill-source-store'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backfillSkillSources, SKILL_SOURCE_BACKFILL_CURSOR } from './skill-source-backfill'
import { skillSourceR2Key } from './skill-source-store'

describe('backfillSkillSources', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE skills (
        owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL,
        rendered_raw TEXT, rendered_raw_sha256 TEXT,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE registry_cursors (
        name TEXT PRIMARY KEY, position INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      );
    `)
    const insert = sqlite.prepare(`INSERT INTO skills (owner, repo, name, rendered_raw, rendered_raw_sha256) VALUES ('acme', 'skills', ?, ?, ?)`)
    insert.run('one', '# One', 'a'.repeat(64))
    insert.run('unrendered', null, null)
    insert.run('two', '# Two', 'b'.repeat(64))
    insert.run('three', '# Three', 'c'.repeat(64))
  })

  afterEach(() => sqlite.close())

  it('walks the table by rowid across runs and stores each body once', async () => {
    const bucket = memoryBucket()

    const first = await backfillSkillSources(wrapSqlite(sqlite), bucket, { now: 1, limit: 2 })
    const second = await backfillSkillSources(wrapSqlite(sqlite), bucket, { now: 2, limit: 2 })
    const third = await backfillSkillSources(wrapSqlite(sqlite), bucket, { now: 3, limit: 2 })

    expect(first).toEqual({ scanned: 2, stored: 2, existing: 0, failed: 0, position: 3 })
    expect(second).toEqual({ scanned: 1, stored: 1, existing: 0, failed: 0, position: 4 })
    expect(third).toEqual({ scanned: 0, stored: 0, existing: 0, failed: 0, position: 4 })
    expect([...bucket.objects.keys()].sort()).toEqual(
      ['a', 'b', 'c'].map(hex => skillSourceR2Key(hex.repeat(64))).sort(),
    )
    expect(cursor()).toBe(4)
  })

  it('holds the cursor before a failed put so the next run retries it', async () => {
    const bucket = memoryBucket(new Set([skillSourceR2Key('b'.repeat(64))]))

    const report = await backfillSkillSources(wrapSqlite(sqlite), bucket, { now: 1, limit: 10 })

    expect(report).toEqual({ scanned: 2, stored: 1, existing: 0, failed: 1, position: 1 })
    expect(cursor()).toBe(1)
  })

  it('reports an object that already exists without storing it again', async () => {
    const bucket = memoryBucket()
    bucket.objects.set(skillSourceR2Key('a'.repeat(64)), new Uint8Array())

    const report = await backfillSkillSources(wrapSqlite(sqlite), bucket, { now: 1, limit: 1 })

    expect(report).toEqual({ scanned: 1, stored: 0, existing: 1, failed: 0, position: 1 })
  })

  function cursor(): number | undefined {
    return sqlite.prepare(`SELECT position FROM registry_cursors WHERE name = ?`).pluck().get(SKILL_SOURCE_BACKFILL_CURSOR) as number | undefined
  }
})

function memoryBucket(failKeys = new Set<string>()): SkillSourceBucket & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put: (async (key: string, value: Uint8Array, options: { onlyIf?: { etagDoesNotMatch?: string } }) => {
      if (failKeys.has(key))
        throw new Error('r2 unavailable')
      if (options.onlyIf?.etagDoesNotMatch === '*' && objects.has(key))
        return null
      objects.set(key, value)
      return { key }
    }) as unknown as SkillSourceBucket['put'],
    get: (async () => null) as unknown as SkillSourceBucket['get'],
    head: (async () => null) as unknown as SkillSourceBucket['head'],
  }
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all<T>() {
              return { results: sqlite.prepare(sql).all(...params) as T[] }
            },
            async first<T>() {
              return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null
            },
            async run() {
              const info = sqlite.prepare(sql).run(...params)
              return { meta: { changes: info.changes } }
            },
          }
        },
      }
    },
  } as unknown as D1Database
}
