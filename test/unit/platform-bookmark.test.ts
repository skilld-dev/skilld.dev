import type { H3Event } from 'h3'
import { createError, defineEventHandler, H3, setCookie, setResponseHeader } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { D1_BOOKMARK_COOKIE } from '../../server/utils/db'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const BOOKMARK = '0000002a-00000007-00005049-2d9a6b3c1f7e4d8a9b0c1d2e3f405162'

afterEach(() => vi.unstubAllGlobals())

describe('platform bookmarks on native Worker requests', () => {
  it('completes authenticated onboarding and carries its bookmark and session update', async () => {
    const fixture = await workerApp()
    try {
      const response = await fixture.app.request(new Request('https://skilld.dev/api/me/onboarded', {
        method: 'POST',
        headers: { cookie: 'nuxt-auth-session=fixture' },
      }))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
      expect(fixture.d1.raw.prepare('SELECT onboarded_at FROM users WHERE id = 900001').get())
        .toEqual({ onboarded_at: expect.any(Number) })
      expect(fixture.session.user.onboarded).toBe(true)
      const cookies = response.headers.getSetCookie()
      expect(cookies).toContainEqual(expect.stringContaining(`${D1_BOOKMARK_COOKIE}=${BOOKMARK}`))
      expect(cookies).toContainEqual(expect.stringContaining('nuxt-auth-session=updated'))
      const bookmarkCookie = cookies.find(cookie => cookie.startsWith(`${D1_BOOKMARK_COOKIE}=`))
      for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax'])
        expect(bookmarkCookie).toContain(attribute)
    }
    finally {
      fixture.d1.close()
    }
  })

  it.each([
    [undefined, undefined],
    ['public, max-age=60', undefined],
    ['private, no-store', 'public, max-age=60'],
  ])('omits bookmarks when a shared cache may store the response (%s, %s)', async (cacheControl, cdnCacheControl) => {
    const fixture = await workerApp()
    fixture.app.post('/write', async (event) => {
      if (cacheControl)
        setResponseHeader(event, 'cache-control', cacheControl)
      if (cdnCacheControl)
        setResponseHeader(event, 'cloudflare-cdn-cache-control', cdnCacheControl)
      await event.context.platform.db.prepare('UPDATE users SET onboarded_at = 123 WHERE id = 900001').run()
      return { ok: true }
    })
    try {
      const response = await fixture.app.request('https://skilld.dev/write', { method: 'POST' })
      expect(response.status).toBe(200)
      expect(response.headers.getSetCookie()).toEqual([])
      expect(fixture.d1.raw.prepare('SELECT onboarded_at FROM users WHERE id = 900001').get())
        .toEqual({ onboarded_at: 123 })
    }
    finally {
      fixture.d1.close()
    }
  })
})

async function workerApp() {
  const d1 = createSqliteD1(allMigrations())
  d1.raw.exec(`INSERT INTO users (id, github_id, login, created_at, last_login_at)
    VALUES (900001, 900001, 'fixture', 1, 1)`)
  // SQLite executes real SQL. Only D1's session/bookmark transport is supplied here.
  const binding = {
    ...d1.db,
    withSession: () => ({
      prepare: d1.db.prepare.bind(d1.db),
      batch: d1.db.batch.bind(d1.db),
      getBookmark: () => BOOKMARK,
    }),
  }
  const session = { user: { id: 900001, login: 'fixture', onboarded: false } }
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  vi.stubGlobal('__env__', undefined)
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('getUserSession', async () => session)
  vi.stubGlobal('setUserSession', async (event: H3Event, updated: typeof session) => {
    session.user = updated.user
    setCookie(event, 'nuxt-auth-session', 'updated')
  })
  const { default: platform } = await import('../../server/plugins/platform')
  const { default: onboarded } = await import('../../layers/identity/server/api/me/onboarded.post')
  let requestHook: (event: H3Event) => void = () => {}
  platform({
    hooks: {
      hook: (_name: string, hook: typeof requestHook) => {
        requestHook = hook
      },
    },
  } as never)
  const app = new H3({
    onRequest: (event) => {
      event.context.cloudflare = { env: { DB: binding } }
      requestHook(event)
    },
  })
  app.post('/api/me/onboarded', (event) => {
    setResponseHeader(event, 'cache-control', 'private, no-store')
    return onboarded(event)
  })
  return { app, d1, session }
}
