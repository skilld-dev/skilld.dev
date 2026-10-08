import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'
import { SIGNED_IN_HEADERS } from './helpers/session'

let fixture: SqliteD1
const headers = new Map<string, string | number>()
const fetchMock = vi.fn()

function seed(resolved: number, raw: string | null) {
  fixture.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('owner', 'repo')`).run()
  fixture.raw.prepare(
    `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_status, rendered_raw, rendered_skill_path, assets)
     VALUES ('owner', 'repo', 'skill', 'owner/repo/skill', 'Skill', ?, 'ok', ?, 'skills/skill/SKILL.md', '[{"path":"references/a.md","size":3,"type":"markdown"}]')`,
  ).run(resolved, raw)
  fixture.raw.prepare('UPDATE skills SET rendered_commit_sha = ?').run('c'.repeat(40))
}

function event(): H3Event {
  return {
    method: 'GET',
    context: { platform: { db: fixture.db } },
    node: { req: { headers: { ...SIGNED_IN_HEADERS } } },
  } as unknown as H3Event
}

beforeEach(() => {
  vi.resetModules()
  headers.clear()
  fetchMock.mockReset()
  fixture = createSqliteD1(allMigrations())
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getRouterParam', () => 'owner/repo/skill')
  vi.stubGlobal('getUserSession', () => Promise.resolve({ user: { id: 1, login: 'tester' } }))
  vi.stubGlobal('setHeader', (_e: H3Event, name: string, value: string | number) => headers.set(name, value))
  vi.stubGlobal('createWideEvent', () => ({ context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }))
  vi.stubGlobal('emitOperationalEvent', vi.fn())
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('useStorage', () => ({ getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined) }))
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('skills-raw handler', () => {
  it('serves the stored SKILL.md with the existing headers and no network call', async () => {
    seed(1, '# Stored')
    const handler = (await import('../../layers/registry/server/api/skills-raw/[...slug].get')).default

    expect(await handler(event())).toBe('# Stored')
    expect(headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(headers.get('cache-control')).toBe('public, max-age=300')
    expect(headers.get('x-skilld-source')).toBe(`owner/repo@${'c'.repeat(40)}/skills/skill/SKILL.md`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 404 when no copy is stored, without a network call', async () => {
    seed(1, null)
    const handler = (await import('../../layers/registry/server/api/skills-raw/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 404 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 410 for a gone Skill, without a network call', async () => {
    seed(0, '# Stored')
    const handler = (await import('../../layers/registry/server/api/skills-raw/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 410 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('skill-files handler', () => {
  it('serves the stored list with no network call', async () => {
    seed(1, '# Stored')
    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    expect(await handler(event())).toEqual({
      skillPath: 'skills/skill/SKILL.md',
      branch: 'c'.repeat(40),
      files: [{ path: 'references/a.md', size: 3, type: 'markdown' }],
      total: 1,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 410 for a gone Skill, without a network call', async () => {
    seed(0, '# Stored')
    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 410 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
