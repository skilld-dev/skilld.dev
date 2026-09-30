import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const cacheMap = new Map<string, unknown>()
vi.stubGlobal('useStorage', () => ({
  getItem: async (key: string) => cacheMap.get(key) ?? null,
  setItem: async (key: string, value: unknown) => {
    cacheMap.set(key, value)
  },
}))
vi.stubGlobal('defineSitemapEventHandler', (handler: unknown) => handler)

let harness: SqliteD1
let handler: (event: H3Event) => Promise<Array<{ loc: string }>>

beforeEach(async () => {
  vi.resetModules()
  cacheMap.clear()
  harness = createSqliteD1(allMigrations())
  seedRepo('ericzakariasson', 'scandinavian-design')
  seedSkill('ericzakariasson', 'scandinavian-design', 'scandinavian-design', 1)
  seedRepo('anthropics', 'skills')
  seedSkill('anthropics', 'skills', 'pdf-processing', 1)
  seedSkill('anthropics', 'skills', 'docx-processing', 1)
  // Only admitted Skills are indexable, so only they reach the sitemap.
  admit('ericzakariasson', 'scandinavian-design', 'scandinavian-design')
  admit('anthropics', 'skills', 'pdf-processing')
  handler = (await import('../../layers/registry/server/api/__sitemap__/skills')).default
})

describe('skills sitemap single-Skill repos', () => {
  it('emits the repo hub URL for a repository with exactly one resolved Skill', async () => {
    const entries = await handler(event())

    expect(entries.map(entry => entry.loc))
      .toContain('/gh/ericzakariasson/scandinavian-design')
  })

  it('keeps the Skill segment for repositories with several Skills', async () => {
    const entries = await handler(event())

    expect(entries.map(entry => entry.loc))
      .toContain('/gh/anthropics/skills/pdf-processing')
    expect(entries.map(entry => entry.loc))
      .not
      .toContain('/gh/ericzakariasson/scandinavian-design/scandinavian-design')
  })

  it('leaves out a Skill that no trending board has admitted', async () => {
    const entries = await handler(event())

    expect(entries.map(entry => entry.loc))
      .not
      .toContain('/gh/anthropics/skills/docx-processing')
  })
})

function seedRepo(owner: string, repo: string) {
  harness.raw.prepare(`INSERT OR IGNORE INTO repos (owner, repo) VALUES (?, ?)`).run(owner, repo)
  harness.raw.prepare(
    `INSERT OR IGNORE INTO supported_repos (owner, repo, support_tier, reason, reviewed_by, reviewed_at)
     VALUES (?, ?, 'curated', 'sitemap fixture', 'test', unixepoch())`,
  ).run(owner, repo)
}

function admit(owner: string, repo: string, name: string) {
  harness.raw.prepare(
    `INSERT INTO skill_trending_admissions (owner, repo, name, admitted_at, first_board) VALUES (?, ?, ?, unixepoch(), 'week')`,
  ).run(owner, repo, name)
}

function seedSkill(owner: string, repo: string, name: string, sourceResolved: number) {
  harness.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, seo_indexable, source_resolved)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).run(owner, repo, name, `${owner}/${repo}/${name}`, name, sourceResolved)
}

function event(): H3Event {
  return {
    context: { platform: { db: harness.db } },
    node: { req: { headers: {} } },
  } as unknown as H3Event
}
