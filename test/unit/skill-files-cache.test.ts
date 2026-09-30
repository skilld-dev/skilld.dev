import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKILL_FILE_LIMIT } from '../../shared/skill-files'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'
import { SIGNED_IN_HEADERS } from './helpers/session'

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
      skillPath: 'skill/SKILL.md',
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

  it('recomputes when a stored value is not a SkillFilesPayload', async () => {
    // Stored bytes are untrusted. A v4 entry whose value is corrupt or
    // foreign must be a miss, not a TypeError on every read until the KV
    // TTL expires the entry.
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 1000, value: {} })
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      files: [
        { path: 'skill/SKILL.md', size: 100 },
        { path: 'skill/assets/cover.png', size: 2048 },
      ],
    }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    const payload = await handler(event())
    expect(payload).toEqual({
      skillPath: 'skill/SKILL.md',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    })
    expect(cache.setItem).toHaveBeenCalledWith(
      CACHE_KEY,
      { storedAt: expect.any(Number), value: payload },
      { ttl: HOUR * 6 + HOUR * 24 },
    )
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
      skillPath: 'skill/SKILL.md',
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

  it('caches a heuristic-resolved SKILL.md-only payload with the full fresh and stale windows', async () => {
    // rendered_skill_path is NULL but the name heuristic finds skill/SKILL.md:
    // the directory is resolved, so the empty file list (the tree filter
    // excludes SKILL.md itself) is the permanent correct answer. The payload
    // must carry the resolved path so it cannot be mistaken for the
    // unresolved fallback, and must ride the 6-hour fresh window with the
    // day-long stale serve.
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ files: [{ path: 'skill/SKILL.md', size: 100 }] }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    const resolved = await handler(event())
    expect(resolved).toEqual({ skillPath: 'skill/SKILL.md', branch: 'main', files: [], total: 0 })
    expect(cache.setItem).toHaveBeenCalledWith(
      CACHE_KEY,
      { storedAt: expect.any(Number), value: resolved },
      { ttl: HOUR * 6 + HOUR * 24 },
    )

    // Seven hours later the entry is past its fresh window. An upstream
    // failure must serve the stale envelope, not propagate the 404.
    cache.getItem.mockResolvedValue({ storedAt: Date.now() - 7 * HOUR * 1000, value: resolved })
    const error = Object.assign(new Error('404 Not Found'), { status: 404, statusCode: 404 })
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(error))

    await expect(handler(event())).resolves.toEqual(resolved)
  })

  it('lists files for a case-variant skill.md the name heuristic finds', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      files: [
        { path: 'skill/skill.md', size: 100 },
        { path: 'skill/assets/cover.png', size: 2048 },
      ],
    }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).resolves.toEqual({
      skillPath: 'skill/skill.md',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    })
  })

  it('lists files for a case-variant stored rendered_skill_path', async () => {
    fixture.raw.prepare(
      `UPDATE skills SET rendered_skill_path = 'skill/Skill.MD'
       WHERE owner = 'owner' AND repo = 'repo' AND name = 'skill'`,
    ).run()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      files: [
        { path: 'skill/Skill.MD', size: 100 },
        { path: 'skill/assets/cover.png', size: 2048 },
      ],
    }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    await expect(handler(event())).resolves.toEqual({
      skillPath: 'skill/Skill.MD',
      branch: 'main',
      files: [{ path: 'assets/cover.png', size: 2048, type: 'image' }],
      total: 1,
    })
  })

  it('keeps an empty list on the missing window when the stored path is absent from the tree', async () => {
    // rendered_skill_path points at a SKILL.md the upstream tree no longer
    // holds (moved or renamed). The empty list is a failed resolution, so it
    // must recheck on the 5-minute window, not ride the 30-hour one.
    fixture.raw.prepare(
      `UPDATE skills SET rendered_skill_path = 'old/SKILL.md'
       WHERE owner = 'owner' AND repo = 'repo' AND name = 'skill'`,
    ).run()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ files: [{ path: 'elsewhere/SKILL.md', size: 100 }] }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default

    const empty = await handler(event())
    expect(empty).toEqual({ skillPath: null, branch: 'main', files: [], total: 0 })
    expect(cache.setItem).toHaveBeenCalledWith(
      CACHE_KEY,
      { storedAt: expect.any(Number), value: empty },
      { ttl: 60 * 5 },
    )
  })

  it('bounds a root SKILL.md over a large repo and keeps its shallow files', async () => {
    fixture.raw.prepare(
      `UPDATE skills SET rendered_skill_path = 'SKILL.md'
       WHERE owner = 'owner' AND repo = 'repo' AND name = 'skill'`,
    ).run()
    const deep = Array.from({ length: SKILL_FILE_LIMIT + 50 }, (_, index) => ({ path: `.github/workflows/${index}.yml`, size: 10 }))
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      files: [...deep, { path: 'README.md', size: 10 }, { path: 'SKILL.md', size: 100 }],
    }))

    const handler = (await import('../../layers/registry/server/api/skill-files/[...slug].get')).default
    const payload = await handler(event())

    expect(payload.skillPath).toBe('SKILL.md')
    expect(payload.total).toBe(SKILL_FILE_LIMIT + 51)
    expect(payload.files).toHaveLength(SKILL_FILE_LIMIT)
    expect(payload.files.map(f => f.path)).toContain('README.md')
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
    node: { req: { headers: { ...SIGNED_IN_HEADERS } } },
  } as unknown as H3Event
}
