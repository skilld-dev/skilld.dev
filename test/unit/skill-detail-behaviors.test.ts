import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW_SEC = Math.floor(Date.now() / 1000)

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
vi.stubGlobal('getUserSession', () => Promise.resolve(null))
vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'slug' ? 'acme/skills/setup' : undefined))
const cacheMap = new Map<string, unknown>()
vi.stubGlobal('useStorage', () => ({
  getItem: async (key: string) => cacheMap.get(key) ?? null,
  setItem: async (key: string, value: unknown) => {
    cacheMap.set(key, value)
  },
}))

let harness: SqliteD1

beforeEach(() => {
  vi.resetModules()
  cacheMap.clear()
  harness = createSqliteD1(allMigrations())
  harness.raw.prepare(`INSERT INTO repos (owner, repo, default_branch) VALUES ('acme', 'skills', 'main')`).run()
  const raw = '---\nname: setup\ndescription: Set up the project.\n---\n\n```sh\nsudo apt-get install jq\n```\n'
  harness.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
       rendered_skill_path, rendered_status, rendered_raw, rendered_html, rendered_at, assets)
     VALUES ('acme', 'skills', 'setup', 'acme/skills/setup', 'setup', 1,
       'skills/setup/SKILL.md', 'ok', ?, '<p>ok</p>', ?, ?)`,
  ).run(raw, NOW_SEC, JSON.stringify([{ path: 'scripts/install.sh', size: 12, type: 'code' }]))
})

describe('skill detail behaviors', () => {
  it('names each behavior in SKILL.md and the stored file names, with a link to where it appears', async () => {
    const handler = (await import('../../layers/registry/server/api/skills/[...slug].get')).default as (event: H3Event) => Promise<{
      sourceFacts: { behaviors: Array<{ id: string, tier: string, locations: Array<{ path: string, line: number | null, url: string | null }> }> }
    }>

    const body = await handler({
      context: { platform: { db: harness.db } },
      node: { req: { headers: {} } },
    } as unknown as H3Event)

    expect(body.sourceFacts.behaviors.map(behavior => [behavior.id, behavior.tier])).toEqual([
      ['privilege', 'ask'],
      ['shell', 'show'],
      ['scripts', 'show'],
      ['packages', 'show'],
    ])
    expect(body.sourceFacts.behaviors[0]?.locations).toEqual([{
      path: 'SKILL.md',
      line: 7,
      url: expect.stringMatching(/^https:\/\/github\.com\/acme\/skills\/blob\/[^/]+\/skills\/setup\/SKILL\.md#L7$/),
    }])
    expect(body.sourceFacts.behaviors[2]?.locations[0]?.url).toMatch(/\/skills\/setup\/scripts\/install\.sh$/)
  })
})
