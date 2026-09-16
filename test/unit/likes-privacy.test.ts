import type { EventHandler, H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const OWNER = { id: 9001, login: 'privacy-owner' }
const VISITOR = { id: 9002, login: 'privacy-visitor' }

describe('liked list privacy', () => {
  let d1: SqliteD1
  let listHandler: EventHandler
  let visibilityHandler: EventHandler
  let privacyHandler: EventHandler
  let meHandler: EventHandler

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
    vi.stubGlobal('setHeader', () => {})
    vi.stubGlobal('getRouterParam', (event: H3Event, key: string) => (event.context.params as Record<string, string>)[key])

    d1 = createSqliteD1(allMigrations())
    d1.raw.exec(`
      INSERT INTO users (id, github_id, login, created_at, last_login_at) VALUES
        (9001, 900100, 'privacy-owner', 1, 1),
        (9002, 900200, 'privacy-visitor', 1, 1);
      INSERT INTO repos (owner, repo) VALUES ('privacy-test', 'skills');
      INSERT INTO skills (owner, repo, name, display_name, slug, source_resolved) VALUES ('privacy-test', 'skills', 'motion', 'Motion', 'privacy-test/skills/motion', 1);
      INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (9001, 'privacy-test', 'skills', 'motion', 10);
    `)

    listHandler = (await import('../../layers/identity/server/api/likes/by-user/[login].get')).default
    visibilityHandler = (await import('../../layers/identity/server/api/likes/by-user/[login]/visibility.get')).default
    privacyHandler = (await import('../../layers/identity/server/api/me/privacy.patch')).default
    meHandler = (await import('../../layers/identity/server/api/me/index.get')).default
  })

  afterEach(() => {
    d1.close()
    vi.unstubAllGlobals()
  })

  it('keeps an existing account private after the migration', async () => {
    await expect(listHandler(event({ viewer: null, login: 'privacy-owner' })))
      .rejects
      .toMatchObject({ statusCode: 404 })
    await expect(visibilityHandler(event({ viewer: VISITOR, login: 'privacy-owner' })))
      .rejects
      .toMatchObject({ statusCode: 404 })
  })

  it('answers a private list and a missing account with the same 404', async () => {
    const privateList = await listHandler(event({ viewer: null, login: 'privacy-owner' })).catch(e => e)
    const missing = await listHandler(event({ viewer: null, login: 'nobody' })).catch(e => e)

    expect({ statusCode: privateList.statusCode, message: privateList.message })
      .toEqual({ statusCode: missing.statusCode, message: missing.message })
  })

  it('shows a private list to its owner and marks it owner only', async () => {
    const list = await listHandler(event({ viewer: OWNER, login: 'PRIVACY-OWNER' })) as { access: string, items: Array<{ name: string }> }

    expect(list.access).toBe('owner')
    expect(list.items.map(item => item.name)).toEqual(['motion'])
    expect(await visibilityHandler(event({ viewer: OWNER, login: 'privacy-owner' }))).toEqual({ access: 'owner' })
  })

  it('opens the list to everyone after the owner turns it on, and closes it again', async () => {
    await privacyHandler(event({ viewer: OWNER, method: 'PATCH', body: { likes_public: true } }))

    const list = await listHandler(event({ viewer: null, login: 'privacy-owner' })) as { access: string, items: unknown[] }
    expect(list.access).toBe('public')
    expect(list.items).toHaveLength(1)
    expect(await visibilityHandler(event({ viewer: VISITOR, login: 'privacy-owner' }))).toEqual({ access: 'public' })
    expect(await meHandler(event({ viewer: OWNER }))).toMatchObject({ likes_public: true })

    await privacyHandler(event({ viewer: OWNER, method: 'PATCH', body: { likes_public: false } }))

    await expect(listHandler(event({ viewer: VISITOR, login: 'privacy-owner' })))
      .rejects
      .toMatchObject({ statusCode: 404 })
  })

  it('changes only the caller setting', async () => {
    await privacyHandler(event({ viewer: VISITOR, method: 'PATCH', body: { likes_public: true } }))

    await expect(listHandler(event({ viewer: null, login: 'privacy-owner' })))
      .rejects
      .toMatchObject({ statusCode: 404 })
  })

  it.each([{}, { likes_public: 'yes' }])('rejects the privacy body %j', async (body) => {
    await expect(privacyHandler(event({ viewer: OWNER, method: 'PATCH', body })))
      .rejects
      .toMatchObject({ statusCode: 400 })
  })

  function event(input: {
    viewer: { id: number, login: string } | null
    login?: string
    method?: string
    body?: unknown
  }): H3Event {
    vi.stubGlobal('getUserSession', () => Promise.resolve(input.viewer ? { user: input.viewer } : {}))
    vi.stubGlobal('readBody', () => Promise.resolve(input.body))
    return {
      method: input.method ?? 'GET',
      context: { platform: { db: d1.db }, params: { login: input.login } },
      node: { req: { headers: {} } },
    } as unknown as H3Event
  }
})
