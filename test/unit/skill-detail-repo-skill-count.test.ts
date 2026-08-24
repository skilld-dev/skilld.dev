import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW_SEC = Math.floor(Date.now() / 1000)

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
vi.stubGlobal('getUserSession', () => Promise.resolve(null))
let slug = ''
vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'slug' ? slug : undefined))
const cacheMap = new Map<string, unknown>()
vi.stubGlobal('useStorage', () => ({
  getItem: async (key: string) => cacheMap.get(key) ?? null,
  setItem: async (key: string, value: unknown) => {
    cacheMap.set(key, value)
  },
}))

let harness: SqliteD1
let handler: (event: H3Event) => Promise<Record<string, unknown>>

beforeEach(async () => {
  vi.resetModules()
  harness = createSqliteD1(allMigrations())
  harness.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('ericzakariasson', 'scandinavian-design')`).run()
  seedSkill('alpha', 1)
  seedSkill('beta', 0)
  slug = 'ericzakariasson/scandinavian-design/alpha'
  handler = (await import('../../layers/registry/server/api/skills/[...slug].get')).default
})

describe('skill detail repoSkillCount', () => {
  it('counts only Skills whose source resolved, matching hub routing and the feed', async () => {
    const body = await handler(event())

    expect(body.repoSkillCount).toBe(1)
  })
})

function seedSkill(name: string, sourceResolved: number) {
  const raw = `---\nname: ${name}\ndescription: A ${name} skill.\n---\n\nBody of ${name}.\n`
  harness.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
       rendered_skill_path, rendered_status, rendered_raw, rendered_html, rendered_at)
     VALUES ('ericzakariasson', 'scandinavian-design', ?, ?, ?, ?,
       'skills/' || ? || '/SKILL.md', 'ok', ?, '<p>ok</p>', ?)`,
  ).run(name, `ericzakariasson/scandinavian-design/${name}`, name, sourceResolved, name, raw, NOW_SEC)
}

function event(): H3Event {
  return {
    context: { platform: { db: harness.db } },
    node: { req: { headers: {} } },
  } as unknown as H3Event
}
