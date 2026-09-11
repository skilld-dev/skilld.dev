import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const HOUR = 60 * 60
const CACHE_KEY = 'skills:files:v4:owner/repo/skill:main'

let fixture: SqliteD1
let cache: {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.resetModules()
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
  vi.stubGlobal('setHeader', vi.fn())
  vi.stubGlobal('createWideEvent', () => ({ context: {}, setLevel: vi.fn(), emit: vi.fn(() => null) }))
  vi.stubGlobal('emitOperationalEvent', vi.fn())
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('skill-files cache', () => {
  it('computes a cold miss and stores a freshness envelope', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      files: [
        { path: 'skill/SKILL.md', size: 100 },
        { path: 'skill/assets/cover.png', size: 2048 },
      ],
    }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default
    const payload = await handler(event())

    expect(payload).toEqual({
      skillPath: null,
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    })
    expect(cache.getItem).toHaveBeenCalledWith(CACHE_KEY)
    expect(cache.setItem).toHaveBeenCalledWith(
      CACHE_KEY,
      { storedAt: expect.any(Number), value: payload },
      { ttl: HOUR * 6 + HOUR * 24 },
    )
  })

  it('serves a fresh envelope without an upstream call', async () => {
    const payload = {
      skillPath: 'skill',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' as const }],
      total: 1,
    }
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 1000, value: payload })
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).resolves.toEqual(payload)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.setItem).not.toHaveBeenCalled()
  })

  it('recomputes a cached no-skillDir empty payload once the missing window expires', async () => {
    // Root SKILL.md with rendered_skill_path NULL: the heuristic misses, so
    // the first run caches the transient empty fallback.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ files: [{ path: 'SKILL.md', size: 100 }] })
      .mockResolvedValueOnce({
        files: [
          { path: 'skill/SKILL.md', size: 100 },
          { path: 'skill/assets/cover.png', size: 2048 },
        ],
      })
    vi.stubGlobal('$fetch', fetchMock)

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    const empty = await handler(event())
    expect(empty).toEqual({ skillPath: null, branch: 'main', files: [], total: 0 })

    // reconcile-rendered re-renders exactly the rows this empty payload came
    // from. Its envelope is now 10 minutes old, past the 5-minute missing
    // window, so the next read must recompute instead of serving it.
    fixture.raw.prepare(
      `UPDATE skills SET rendered_skill_path = 'skill/SKILL.md'
       WHERE owner = 'owner' AND repo = 'repo' AND name = 'skill'`,
    ).run()
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 10 * 60 * 1000, value: empty })

    const payload = await handler(event())

    expect(payload).toEqual({
      skillPath: 'skill/SKILL.md',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('recomputes a cached empty-tree payload once the missing window expires', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ files: [] })
      .mockResolvedValueOnce({
        files: [
          { path: 'skill/SKILL.md', size: 100 },
          { path: 'skill/assets/cover.png', size: 2048 },
        ],
      })
    vi.stubGlobal('$fetch', fetchMock)

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    const empty = await handler(event())
    expect(empty).toEqual({ skillPath: null, branch: 'main', files: [], total: 0 })

    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 10 * 60 * 1000, value: empty })

    const payload = await handler(event())

    expect(payload).toEqual({
      skillPath: null,
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps a resolved SKILL.md-only empty payload on the full fresh and stale windows', async () => {
    // A skill directory holding only SKILL.md is fully resolved: the tree
    // filter excludes SKILL.md itself, so files: [] with a non-null
    // skillPath is the permanent correct answer, not a transient miss.
    fixture.raw.prepare(
      `UPDATE skills SET rendered_skill_path = 'skill/SKILL.md'
       WHERE owner = 'owner' AND repo = 'repo' AND name = 'skill'`,
    ).run()

    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ files: [{ path: 'skill/SKILL.md', size: 100 }] }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    const resolved = await handler(event())
    expect(resolved).toEqual({ skillPath: 'skill/SKILL.md', branch: 'main', files: [], total: 0 })
    expect(cache.setItem).toHaveBeenCalledWith(
      CACHE_KEY,
      { storedAt: expect.any(Number), value: resolved },
      { ttl: HOUR * 6 + HOUR * 24 },
    )

    // Seven hours later the entry is past even the resolved payload's
    // 6-hour fresh window. An upstream failure must serve the stale
    // envelope, not propagate.
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 7 * HOUR * 1000, value: resolved })
    const error = Object.assign(new Error('404 Not Found'), { status: 404, statusCode: 404 })
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(error))

    await expect(handler(event())).resolves.toEqual(resolved)
  })

  it('serves the stale envelope when the upstream tree fails', async () => {
    const stale = {
      skillPath: 'skill',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' as const }],
      total: 1,
    }
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - (HOUR * 6 + 60) * 1000, value: stale })
    const error = Object.assign(new Error('404 Not Found'), { status: 404, statusCode: 404 })
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(error))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).resolves.toEqual(stale)
  })
})

function event(): H3Event {
  return {
    method: 'GET',
    context: { platform: { db: fixture.db } },
  } as unknown as H3Event
}
