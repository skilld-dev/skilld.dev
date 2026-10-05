// @vitest-environment node
import type { H3Event } from 'h3'
import type { SQLInputValue } from 'node:sqlite'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The released nuxt-ai-ready runtime must treat a 410
 * route as terminal: the page row is pruned and the cron index result stays
 * error-free, instead of the seed re-arming the failed row every crawl.
 *
 * Keep this regression coverage when updating the package catalog pin.
 */

const mocks = vi.hoisted(() => ({
  initSchema: vi.fn(),
  runtimeConfig: {} as Record<string, unknown>,
  useRawDb: vi.fn(),
  fetchWithEvent: vi.fn(),
}))

vi.mock('#nuxtseo/nitro', () => ({
  useEvent: () => {
    throw new Error('No active event')
  },
  useRuntimeConfig: () => mocks.runtimeConfig,
  fetchWithEvent: mocks.fetchWithEvent,
  useNitroApp: () => ({ hooks: { callHook: vi.fn() } }),
}))

// The package exports map only exposes the module entry, so the test reaches
// the runtime dist files by path. `vi.mock` matches the dist files' own
// relative imports of the same real paths.
vi.mock('../../node_modules/nuxt-ai-ready/dist/runtime/server/db/drizzle/queries.js', () => ({
  initSchema: mocks.initSchema,
}))

vi.mock('../../node_modules/nuxt-ai-ready/dist/runtime/server/db/drizzle/raw.js', () => ({
  useRawDb: mocks.useRawDb,
}))

// Build dump restoration is a separate boundary from route indexing.
vi.mock('../../node_modules/nuxt-ai-ready/dist/runtime/server/utils/checkStale.js', () => ({
  checkAndHandleStale: async () => ({ action: 'none' }),
}))

vi.mock('../../node_modules/nuxt-ai-ready/dist/runtime/server/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// indexPage.js pulls in the module's utils.js for the success path, whose
// mdream import loads a wasm asset no test environment serves. The 410 paths
// under test never reach it.
vi.mock('../../node_modules/nuxt-ai-ready/dist/runtime/server/utils.js', () => ({
  convertHtmlToMarkdown: () => {
    throw new Error('convertHtmlToMarkdown is not available in tests')
  },
}))

const { seedRoutes } = await import('../../node_modules/nuxt-ai-ready/dist/runtime/server/db/queries.js')
const { batchIndexPages } = await import('../../node_modules/nuxt-ai-ready/dist/runtime/server/utils/batchIndex.js')
const { indexPageByRoute } = await import('../../node_modules/nuxt-ai-ready/dist/runtime/server/utils/indexPage.js')

const HOUR = 60 * 60 * 1000
const T0 = Date.UTC(2026, 9, 1)
// Truthy so the dist code routes fetches through `fetchWithEvent`, which the
// test controls.
const event = {
  fetch: () => new Response(null),
  __is_event__: true,
  node: {},
  context: {},
} as unknown as H3Event

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ai_ready_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route TEXT UNIQUE NOT NULL,
    route_key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    markdown TEXT NOT NULL DEFAULT '',
    headings TEXT NOT NULL DEFAULT '[]',
    keywords TEXT NOT NULL DEFAULT '[]',
    content_hash TEXT,
    updated_at TEXT NOT NULL,
    indexed_at INTEGER NOT NULL,
    is_error INTEGER NOT NULL DEFAULT 0,
    indexed INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'prerender',
    last_seen_at INTEGER,
    locale TEXT NOT NULL DEFAULT ''
  )
`

function goneFetchError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status} Gone`), {
    status,
    statusCode: status,
  })
}

describe('ai-ready gone route', () => {
  let sqlite: DatabaseSync

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec(SCHEMA)
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue({
      dialect: 'sqlite',
      all: async (sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).all(...params),
      first: async (sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).get(...params),
      exec: async (sql: string, params: SQLInputValue[] = []) => {
        sqlite.prepare(sql).run(...params)
      },
      batch: async (stmts: { sql: string, params?: SQLInputValue[] }[]) => {
        for (const stmt of stmts)
          sqlite.prepare(stmt.sql).run(...(stmt.params || []))
      },
    })
    mocks.fetchWithEvent.mockReset()
    mocks.runtimeConfig['nuxt-ai-ready'] = {
      debug: false,
      database: { _tag: 'Enabled', type: 'd1' },
      runtimeSync: { enabled: true, ttl: 3600, batchSize: 10 },
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  function rowCount(): number {
    return Number(sqlite.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()?.count ?? 0)
  }

  function row(route: string): { is_error: number, indexed: number } | undefined {
    return sqlite.prepare('SELECT is_error, indexed FROM ai_ready_pages WHERE route = ?').get(route) as { is_error: number, indexed: number } | undefined
  }

  it.each([
    { status: 410 },
    { statusCode: 410 },
    { response: { status: 410 } },
  ])('reports a gone route without an indexing error for %j', async (status) => {
    await seedRoutes(event, ['/gone'])
    mocks.fetchWithEvent.mockRejectedValue(Object.assign(new Error('Gone'), status))

    expect(await indexPageByRoute('/gone', event, { markFailedAsError: true })).toEqual({
      success: false,
      gone: true,
    })
    expect(rowCount()).toBe(0)
  })

  it('does not re-arm a failed row inside the seed refresh window', async () => {
    await seedRoutes(event, ['/failed'])
    mocks.fetchWithEvent.mockRejectedValue(goneFetchError(500))
    await batchIndexPages(event, { limit: 10 })
    expect(row('/failed')).toMatchObject({ is_error: 1 })

    await seedRoutes(event, ['/failed'])
    expect(row('/failed')).toMatchObject({ is_error: 1 })
  })

  it('re-arms a failed row after the seed refresh window', async () => {
    await seedRoutes(event, ['/failed'])
    mocks.fetchWithEvent.mockRejectedValue(goneFetchError(500))
    await batchIndexPages(event, { limit: 10 })
    expect(row('/failed')).toMatchObject({ is_error: 1 })

    vi.setSystemTime(T0 + 25 * HOUR)
    await seedRoutes(event, ['/failed'])
    expect(row('/failed')).toEqual({ is_error: 0, indexed: 0 })
  })

  it('prunes a 410 route and keeps indexResult.errors empty across two cron passes', async () => {
    mocks.fetchWithEvent.mockRejectedValue(goneFetchError(410))

    await seedRoutes(event, ['/gone'])
    const first = await batchIndexPages(event, { limit: 10 })
    expect(first.errors).toEqual([])
    expect(first.indexed).toBe(0)
    expect(first.remaining).toBe(0)
    expect(first.complete).toBe(true)
    expect(rowCount()).toBe(0)

    // The sitemap still lists the route, so the next pass re-seeds it; the
    // fetch is gone again, the row is pruned again, and nothing is reported.
    await seedRoutes(event, ['/gone'])
    expect(rowCount()).toBe(1)
    const second = await batchIndexPages(event, { limit: 10 })
    expect(second.errors).toEqual([])
    expect(second.remaining).toBe(0)
    expect(rowCount()).toBe(0)
  })
})
