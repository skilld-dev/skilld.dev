import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

let fixture: SqliteD1
let cache: {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
}
const responseHeaders = new Map<string, string | number>()

beforeEach(() => {
  vi.resetModules()
  responseHeaders.clear()
  fixture = createSqliteD1(allMigrations())
  fixture.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('owner', 'repo')`).run()
  fixture.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved)
     VALUES ('owner', 'repo', 'skill', 'owner/repo/skill', 'Skill', 1)`,
  ).run()
  cache = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  }

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getRouterParam', () => 'owner/repo/skill')
  vi.stubGlobal('getUserSession', () => Promise.resolve({ user: { id: 1, login: 'tester' } }))
  vi.stubGlobal('useStorage', () => cache)
  vi.stubGlobal('setHeader', (_event: H3Event, name: string, value: string | number) => {
    responseHeaders.set(name, value)
  })
  vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('tree unavailable')))
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('skill-files tree outage', () => {
  it('returns a retryable error without caching an empty file list', async () => {
    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })

    expect(cache.setItem).not.toHaveBeenCalled()
    expect(responseHeaders.get('retry-after')).toBe(30)
  })
})

function event(): H3Event {
  return {
    method: 'GET',
    context: { platform: { db: fixture.db } },
  } as unknown as H3Event
}
