import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW_SEC = Math.floor(Date.now() / 1000)
const repositoryLicense = vi.hoisted(() => vi.fn().mockResolvedValue({ _tag: 'known', license: 'MIT' }))
vi.mock('../../layers/registry/server/utils/skill-license', () => ({ readRepositoryLicense: repositoryLicense }))

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

function seed(sourceResolved: number) {
  harness.raw.prepare(`INSERT INTO repos (owner, repo, default_branch) VALUES ('acme', 'skills', 'main')`).run()
  const raw = '---\nname: setup\ndescription: Set up the project.\n---\n\n```sh\nsudo apt-get install jq\n```\n'
  harness.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
       rendered_skill_path, rendered_status, rendered_raw, rendered_html, rendered_at, assets)
     VALUES ('acme', 'skills', 'setup', 'acme/skills/setup', 'setup', ?,
       'skills/setup/SKILL.md', 'ok', ?, '<p>ok</p>', ?, ?)`,
  ).run(sourceResolved, raw, NOW_SEC, JSON.stringify([{ path: 'scripts/install.sh', size: 12, type: 'code' }]))
}

interface Body {
  license: string | null
  licenseSource: 'skill' | 'repository' | null
  sourceFacts: { behaviors: Array<{ id: string, tier: string, locations: Array<{ path: string, line: number | null, url: string | null }> }> }
}

async function detail(): Promise<Body> {
  const handler = (await import('../../layers/registry/server/api/skills/[...slug].get')).default as (event: H3Event) => Promise<Body>
  return handler({
    context: { platform: { db: harness.db } },
    node: { req: { headers: {} } },
  } as unknown as H3Event)
}

beforeEach(() => {
  vi.resetModules()
  cacheMap.clear()
  repositoryLicense.mockClear()
  harness = createSqliteD1(allMigrations())
})

describe('skill detail behaviors', () => {
  it('uses the root Repository license at the snapshot commit', async () => {
    seed(1)
    harness.raw.prepare('UPDATE skills SET rendered_skill_path = \'SKILL.md\', rendered_commit_sha = ?').run('c'.repeat(40))
    const body = await detail()
    expect(body.license).toBe('MIT')
    expect(body.licenseSource).toBe('repository')
    expect(repositoryLicense.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ owner: 'acme', repo: 'skills', commit: 'c'.repeat(40) }))
  })

  it('keeps declared Skill terms above the Repository license', async () => {
    seed(1)
    harness.raw.prepare('UPDATE skills SET rendered_skill_path = \'SKILL.md\', rendered_commit_sha = ?, rendered_raw = ?').run('c'.repeat(40), '---\nname: setup\nlicense: BSD-3-Clause\n---\n\nUse this Skill.')
    const body = await detail()
    expect(body.license).toBe('BSD-3-Clause')
    expect(body.licenseSource).toBe('skill')
    expect(repositoryLicense).not.toHaveBeenCalled()
  })
  it('names each behavior in SKILL.md and the stored file names, with a link to where it appears', async () => {
    seed(1)

    const body = await detail()

    expect(body.sourceFacts.behaviors.map(behavior => [behavior.id, behavior.tier])).toEqual([
      ['privilege', 'ask'],
      ['shell', 'show'],
      ['scripts', 'show'],
      ['packages', 'show'],
    ])
    expect(body.sourceFacts.behaviors[0]?.locations).toEqual([{
      path: 'SKILL.md',
      line: 7,
      url: expect.stringMatching(/^https:\/\/github\.com\/acme\/skills\/blob\/[^/]+\/skills\/setup\/SKILL\.md\?plain=1#L7$/),
    }])
    expect(body.sourceFacts.behaviors[2]?.locations[0]?.url).toMatch(/\/skills\/setup\/scripts\/install\.sh$/)
  })

  it('links nothing once the upstream SKILL.md is gone', async () => {
    seed(0)

    const body = await detail()

    expect(body.sourceFacts.behaviors.length).toBeGreaterThan(0)
    expect(body.sourceFacts.behaviors.flatMap(behavior => behavior.locations.map(location => location.url))).toEqual(
      body.sourceFacts.behaviors.flatMap(behavior => behavior.locations.map(() => null)),
    )
  })
})
