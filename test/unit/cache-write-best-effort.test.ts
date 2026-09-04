import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCache, writeCache } from '../../shared/server/cache'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  return entries.flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory())
      return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

describe('best-effort cache writes', () => {
  it('resolves when the KV write is rate limited', async () => {
    const setItem = vi.fn(async () => {
      throw new Error('KV PUT failed: 429 Too Many Requests')
    })

    await expect(writeCache(
      { setItem } as unknown as Parameters<typeof writeCache>[0],
      'skills:duplicate-candidates:all:noagg',
      [{ owner: 'garrytan' }],
      { ttl: 300 },
    )).resolves.toBeUndefined()

    expect(setItem).toHaveBeenCalledOnce()
  })

  it('passes the value and options through on success', async () => {
    const setItem = vi.fn(async () => {})

    await writeCache(
      { setItem } as unknown as Parameters<typeof writeCache>[0],
      'skills:endorsement-map',
      { a: 1 },
      { ttl: 300 },
    )

    expect(setItem).toHaveBeenCalledWith('skills:endorsement-map', { a: 1 }, { ttl: 300 })
  })

  it('routes every server cache write through the helper', () => {
    const roots = ['layers', 'server'].map(root => join(process.cwd(), root))
    const offenders = roots
      .flatMap(root => sourceFiles(root))
      .filter(path => path.includes(`${'server'}/`))
      .flatMap((path) => {
        const lines = readFileSync(path, 'utf8').split('\n')
        return lines.flatMap((line, index) =>
          /useStorage\(['"]cache['"]\)\.setItem\(/.test(line)
            ? [`${path.replace(`${process.cwd()}/`, '')}:${index + 1}`]
            : [],
        )
      })

    expect(offenders).toEqual([])
  })
})

describe('best-effort cache reads', () => {
  it('treats a KV read failure as a miss instead of failing the request', async () => {
    const getItem = vi.fn(async () => {
      throw new Error('KV GET failed: 500 Internal Server Error')
    })

    await expect(readCache(
      { getItem } as unknown as Parameters<typeof readCache>[0],
      'skills:related:v3:dylantarre/animation-principles/educator-teacher',
    )).resolves.toBeNull()

    expect(getItem).toHaveBeenCalledOnce()
  })

  it('returns the cached value on a hit', async () => {
    const getItem = vi.fn(async () => ({ commits: [] }))

    const value = await readCache<{ commits: unknown[] }>(
      { getItem } as unknown as Parameters<typeof readCache>[0],
      'skills:related:v3:acme/skills/deploy',
    )

    expect(value).toEqual({ commits: [] })
    expect(getItem).toHaveBeenCalledWith('skills:related:v3:acme/skills/deploy')
  })

  it('routes every server cache read through the helper', () => {
    const roots = ['layers', 'server'].map(root => join(process.cwd(), root))
    const offenders = roots
      .flatMap(root => sourceFiles(root))
      .filter(path => path.includes(`${'server'}/`))
      .flatMap((path) => {
        const lines = readFileSync(path, 'utf8').split('\n')
        return lines.flatMap((line, index) =>
          /useStorage\(['"]cache['"]\)\.getItem[<(]/.test(line)
            ? [`${path.replace(`${process.cwd()}/`, '')}:${index + 1}`]
            : [],
        )
      })

    expect(offenders).toEqual([])
  })
})

describe('skill detail route cache', () => {
  const NOW_SEC = Math.floor(Date.now() / 1000)
  const slug = 'ericzakariasson/scandinavian-design/alpha'
  let harness: SqliteD1
  let handler: (event: H3Event) => Promise<Record<string, unknown>>

  // Nitro's cached handler: on a miss it computes the response and awaits
  // storage.setItem, so a KV PUT rejection travels out of the handler as a
  // 500 (Sentry SKILLD-1V). This stub keeps that documented behaviour honest,
  // so the regression test fails again if the route ever returns to
  // defineCachedEventHandler.
  vi.stubGlobal('defineCachedEventHandler', (
    handler: (event: H3Event) => Promise<unknown>,
    opts: { getKey: (event: H3Event) => string },
  ) => {
    return async (event: H3Event) => {
      const storage = useStorage('cache')
      const key = opts.getKey(event)
      const cached = await storage.getItem(key)
      if (cached != null)
        return cached
      const result = await handler(event)
      await storage.setItem(key, result, { ttl: 60 })
      return result
    }
  })
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
  vi.stubGlobal('getUserSession', () => Promise.resolve(null))
  vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'slug' ? slug : undefined))

  beforeEach(async () => {
    vi.resetModules()
    harness = createSqliteD1(allMigrations())
    harness.raw.prepare(`INSERT INTO repos (owner, repo) VALUES ('ericzakariasson', 'scandinavian-design')`).run()
    const raw = `---\nname: alpha\ndescription: A alpha skill.\n---\n\nBody of alpha.\n`
    harness.raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
         rendered_skill_path, rendered_status, rendered_raw, rendered_html, rendered_at)
       VALUES ('ericzakariasson', 'scandinavian-design', 'alpha', ?, 'alpha', 1,
         'skills/alpha/SKILL.md', 'ok', ?, '<p>ok</p>', ?)`,
    ).run(slug, raw, NOW_SEC)
    handler = (await import('../../layers/registry/server/api/skills/[...slug].get')).default
  })

  it('serves the page even when the KV cache write is rate limited', async () => {
    const setItem = vi.fn(async () => {
      throw new Error('KV PUT failed: 429 Too Many Requests')
    })
    vi.stubGlobal('useStorage', () => ({
      getItem: async () => null,
      setItem,
    }))

    const body = await handler(event())

    expect(body.registryPath).toBe('/gh/ericzakariasson/scandinavian-design')
    expect(setItem).toHaveBeenCalledWith(
      expect.stringContaining('skills:detail:'),
      expect.objectContaining({ registryPath: '/gh/ericzakariasson/scandinavian-design' }),
      { ttl: 60 },
    )
  })

  it('serves the cached response on a hit without recomputing', async () => {
    const cacheMap = new Map<string, unknown>()
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => cacheMap.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        cacheMap.set(key, value)
      },
    }))

    const fresh = await handler(event())
    await expect(handler(event())).resolves.toBe(fresh)
  })

  function event(): H3Event {
    return {
      context: { platform: { db: harness.db } },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }
})
