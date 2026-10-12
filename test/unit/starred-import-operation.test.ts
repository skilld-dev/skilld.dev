import type { SqliteD1 } from './helpers/d1-sqlite'
import { createApp, createError, eventHandler, readBody, toWebHandler } from 'h3'
import { starsV1 } from 'skilld-sdk/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import importStars from '../../layers/identity/server/api/v1/account/stars/import.post'
import { importStarredPage, loadStarredRows } from '../../layers/identity/server/utils/starred-repos'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

vi.mock('../../shared/server/handler', async importOriginal => ({
  ...await importOriginal<typeof import('../../shared/server/handler')>(),
  resolveRequestUser: async () => ({ id: 1, login: 'reader' }),
}))
vi.mock('../../layers/identity/server/utils/users', async importOriginal => ({
  ...await importOriginal<typeof import('../../layers/identity/server/utils/users')>(),
  requireGithubUserToken: async () => 'fixture',
}))
vi.mock('#app/nuxt', async importOriginal => ({
  ...await importOriginal<typeof import('#app/nuxt')>(),
  useRuntimeConfig: () => ({ tokenKey: 'fixture' }),
}))
const star = (name: string) => ({ starred_at: '2026-10-05T00:00:00Z', repo: { name, owner: { login: 'reader' } } })

describe('public bounded star import', () => {
  let d1: SqliteD1
  beforeEach(() => {
    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`INSERT OR REPLACE INTO users (id, github_id, login, created_at, last_login_at, stars_synced_at) VALUES (1, 11, 'reader', 1, 1, 9);
      INSERT INTO user_starred_repos VALUES (1, 'old', 'usable', 1, 0)`)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('createWideEvent', (fields: unknown) => fields)
    vi.stubGlobal('emitOperationalEvent', vi.fn())
    vi.stubGlobal('readBody', readBody)
    vi.stubGlobal('useRuntimeConfig', () => ({ tokenKey: 'fixture' }))
  })
  afterEach(() => {
    d1.close()
    vi.unstubAllGlobals()
  })
  function request(page = 1) {
    const app = createApp()
    app.use(eventHandler((event) => {
      event.context.platform = { db: d1.db, requestId: 'stars_test' } as never
    }))
    app.use(importStars)
    return toWebHandler(app)(new Request('http://localhost/api/v1/account/stars/import', { method: 'POST', body: JSON.stringify({ page }), headers: { 'content-type': 'application/json' } }))
  }
  const pages = (prefix: string) => async (url: string) => Response.json(new URL(url).searchParams.get('page') === '1'
    ? Array.from({ length: 100 }, (_, i) => star(`${prefix}-${i}`))
    : [star(`${prefix}-last`)])

  it.each([1, 2])('completes all GitHub pages in a request with legacy page %s', async (page) => {
    vi.stubGlobal('fetch', pages('complete'))
    const response = await request(page)
    expect(response.status).toBe(200)
    expect(starsV1.operations.import.response.body.producer.parse(await response.json())).toMatchObject({ page, nextPage: null, imported: 101, withSkills: 0, importedAt: expect.any(String) })
    expect(await loadStarredRows(d1.db, 1)).toHaveLength(101)
  })
  it('preserves the usable import if a later successful GitHub response is malformed', async () => {
    vi.stubGlobal('fetch', async (url: string) => new URL(url).searchParams.get('page') === '1'
      ? pages('staged')(url)
      : Response.json({ message: 'Invalid page' }))
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'old', repo: 'usable' }])
    expect(d1.raw.prepare('SELECT stars_synced_at FROM users WHERE id=1').get()).toMatchObject({ stars_synced_at: 9 })
  })
  it('maps malformed provider JSON to SERVICE_UNAVAILABLE without replacing usable stars', async () => {
    vi.stubGlobal('fetch', async () => new Response('{'))
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(await loadStarredRows(d1.db, 1)).toMatchObject([{ owner: 'old', repo: 'usable' }])
  })
  it('stops a public import if a browser publishes a different generation', async () => {
    let release!: (response: Response) => void
    const delayed = new Promise<Response>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const fetchingSecondPage = new Promise<void>((resolve) => {
      entered = resolve
    })
    vi.stubGlobal('fetch', async (url: string) => {
      if (new URL(url).searchParams.get('page') === '1')
        return pages('public')(url)
      entered()
      return delayed
    })
    const older = request()
    await fetchingSecondPage
    await importStarredPage({ db: d1.db, userId: 1, githubToken: 'fixture', page: 1, fetch: async () => Response.json([star('browser')]) })
    release(Response.json([star('public-last')]))
    expect((await older).status).toBe(400)
    expect((await loadStarredRows(d1.db, 1)).map(row => row.repo)).toEqual(['browser'])
  })
  it('prevents an older concurrent full import from publishing mixed rows', async () => {
    let release!: (response: Response) => void
    const delayed = new Promise<Response>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const fetchingSecondPage = new Promise<void>((resolve) => {
      entered = resolve
    })
    vi.stubGlobal('fetch', async (url: string) => {
      if (new URL(url).searchParams.get('page') === '1')
        return pages('older')(url)
      entered()
      return delayed
    })
    const older = request()
    await fetchingSecondPage
    vi.stubGlobal('fetch', pages('newer'))
    const newer = await request()
    release(Response.json([star('older-last')]))
    expect(newer.status).toBe(200)
    expect((await older).status).toBe(400)
    expect((await loadStarredRows(d1.db, 1)).map(row => row.repo).sort()).toEqual([...Array.from({ length: 100 }, (_, i) => `newer-${i}`), 'newer-last'].sort())
  })
})
