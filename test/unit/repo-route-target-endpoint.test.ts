import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('defineCachedEventHandler', (handler: (event: H3Event) => Promise<unknown>) => {
  let cached: unknown
  return async (event: H3Event) => {
    cached ??= await handler(event)
    return cached
  }
})
vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => {
  if (key === 'owner')
    return 'antfu'
  if (key === 'repo')
    return 'skills'
  return undefined
})

let harness: SqliteD1
let handler: (event: H3Event) => Promise<Record<string, unknown>>

beforeEach(async () => {
  vi.resetModules()
  harness = createSqliteD1(allMigrations())
  harness.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('antfu', 'skills')`).run()
  harness.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved)
     VALUES ('antfu', 'skills', 'vite', 'antfu/skills/vite', 'Vite', 1)`,
  ).run()
  handler = (await import('../../layers/registry/server/api/repos/[owner]/[repo]/route-target.get')).default
})

afterEach(() => {
  harness.close()
})

describe('repository route target endpoint', () => {
  it('resolves an indexed single skill without loading GitHub repository data', async () => {
    await expect(handler(event())).resolves.toEqual({
      owner: 'antfu',
      repo: 'skills',
      target: { _tag: 'skill', name: 'vite' },
    })
  })

  it('sees a skill indexed after the first request', async () => {
    harness.raw.prepare(`DELETE FROM skills WHERE owner = 'antfu' AND repo = 'skills'`).run()

    await expect(handler(event())).resolves.toMatchObject({
      target: { _tag: 'repo' },
    })

    harness.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved)
       VALUES ('antfu', 'skills', 'vite', 'antfu/skills/vite', 'Vite', 1)`,
    ).run()

    await expect(handler(event())).resolves.toMatchObject({
      target: { _tag: 'skill', name: 'vite' },
    })
  })
})

function event(): H3Event {
  return {
    context: { platform: { db: harness.db } },
  } as unknown as H3Event
}
