import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tarGzFixture } from '../fixtures/tar-archive'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

describe('package detection cache', () => {
  let harness: SqliteD1
  let handler: (event: H3Event) => Promise<unknown>
  let failure: 'oversized' | 'upstream' | null
  let archiveReads: number
  let manifestReads: number

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T00:00:00Z'))
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
    vi.stubGlobal('getUserSession', () => Promise.resolve(null))
    vi.stubGlobal('getQuery', () => ({}))
    vi.stubGlobal('getRouterParam', () => 'acme/kit/auth')
    const entries = new Map<string, unknown>()
    vi.stubGlobal('useStorage', () => ({
      getItem: async (key: string) => entries.get(key) ?? null,
      setItem: async (key: string, value: unknown) => { entries.set(key, value) },
    }))
    harness = createSqliteD1(allMigrations())
    harness.raw.prepare('INSERT INTO repos (owner, repo) VALUES (\'acme\', \'kit\')').run()
    harness.raw.prepare(`INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved, rendered_skill_path)
      VALUES ('acme', 'kit', 'auth', 'acme/kit/auth', 'auth', 1, 'skills/auth/SKILL.md')`).run()
    failure = null
    archiveReads = 0
    manifestReads = 0
    vi.stubGlobal('fetch', async (input: unknown) => {
      const url = String(input)
      if (url.includes('raw.githubusercontent.com')) {
        manifestReads++
        return Response.json({ name: 'kit', version: '1.0.0' })
      }
      if (url.endsWith('/latest')) {
        if (failure === 'upstream')
          return new Response(null, { status: 503 })
        return Response.json({
          name: 'kit',
          version: '1.0.0',
          repository: { url: 'https://github.com/acme/kit' },
          dist: { tarball: 'https://registry.npmjs.org/kit/-/kit-1.0.0.tgz' },
        })
      }
      archiveReads++
      if (failure === 'oversized')
        return new Response(new Uint8Array(8 * 1024 * 1024 + 1))
      return new Response(tarGzFixture('package', [{ path: 'skills/auth/SKILL.md', bytes: new TextEncoder().encode('Use auth.') }]))
    })
    // Load after Nitro globals are installed, as in the other route fixtures.
    handler = (await import('../../layers/registry/server/api/skill-package/[...slug].get')).default
  })

  afterEach(() => {
    harness.raw.close()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each(['oversized', 'upstream'] as const)('caches %s failures for one minute, then recovers', async (reason) => {
    failure = reason
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })
    failure = null
    vi.setSystemTime(Date.now() + 59_000)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })
    expect(manifestReads).toBe(1)
    expect(archiveReads).toBe(reason === 'oversized' ? 1 : 0)

    vi.setSystemTime(Date.now() + 1_000)
    await expect(handler(event())).resolves.toEqual({ _tag: 'Found', package: 'kit', version: '1.0.0', skill: 'auth' })
    expect(manifestReads).toBe(2)
    vi.setSystemTime(Date.now() + 3_599_000)
    await handler(event())
    expect(manifestReads).toBe(2)
    vi.setSystemTime(Date.now() + 1_000)
    await handler(event())
    expect(manifestReads).toBe(3)
  })

  it('caches a Skill outside the package layout for one hour', async () => {
    harness.raw.prepare('UPDATE skills SET rendered_skill_path = \'SKILL.md\'').run()
    await expect(handler(event())).resolves.toEqual({ _tag: 'Absent' })
    harness.raw.prepare('DELETE FROM skills').run()
    vi.setSystemTime(Date.now() + 3_599_000)
    await expect(handler(event())).resolves.toEqual({ _tag: 'Absent' })
    expect(manifestReads).toBe(0)
    vi.setSystemTime(Date.now() + 1_000)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 404 })
  })

  function event(): H3Event {
    return { context: { platform: { db: harness.db } }, node: { req: { headers: {} } } } as unknown as H3Event
  }
})
