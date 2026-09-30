import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decideSessionAccess, readUserSession } from '../../shared/server/session-access'

// h3's `useSession` mints a session and sets its cookie whenever a request
// arrives without one. Reading the session on an anonymous request is what put
// a `nuxt-session` cookie on `/api/skills`, and a response that sets a cookie
// is never stored by a shared cache.
describe('decideSessionAccess', () => {
  it.each([
    { name: 'no cookie header', cookie: undefined, sessionHeader: undefined, expected: 'anonymous' },
    { name: 'empty cookie header', cookie: '', sessionHeader: undefined, expected: 'anonymous' },
    { name: 'unrelated cookies only', cookie: 'theme=dark; __cf_bm=abc', sessionHeader: undefined, expected: 'anonymous' },
    { name: 'a cleared session cookie', cookie: 'nuxt-session=', sessionHeader: undefined, expected: 'anonymous' },
    { name: 'a cookie whose name only ends with the session name', cookie: 'old-nuxt-session=Fe26.2', sessionHeader: undefined, expected: 'anonymous' },
    { name: 'the session cookie', cookie: 'nuxt-session=Fe26.2**abc', sessionHeader: undefined, expected: 'carried' },
    { name: 'the session cookie among others', cookie: 'theme=dark;  nuxt-session=Fe26.2**abc ; x=1', sessionHeader: undefined, expected: 'carried' },
    { name: 'the session header', cookie: undefined, sessionHeader: 'Fe26.2**abc', expected: 'carried' },
    { name: 'an empty session header', cookie: undefined, sessionHeader: '', expected: 'anonymous' },
  ])('$name is $expected', ({ cookie, sessionHeader, expected }) => {
    expect(decideSessionAccess({ cookie, sessionHeader })._tag).toBe(expected)
  })
})

describe('readUserSession', () => {
  const getUserSession = vi.fn()
  vi.stubGlobal('getUserSession', getUserSession)

  beforeEach(() => {
    getUserSession.mockReset()
    getUserSession.mockResolvedValue({ id: 'sealed-id', user: { id: 7, login: 'octocat' } })
  })

  function event(headers: Record<string, string>): H3Event {
    return { node: { req: { headers } }, context: {} } as unknown as H3Event
  }

  it('never opens a session for an anonymous request', async () => {
    await expect(readUserSession(event({ cookie: 'theme=dark' }))).resolves.toBeNull()
    expect(getUserSession).not.toHaveBeenCalled()
  })

  it('reads the session a request carries', async () => {
    await expect(readUserSession(event({ cookie: 'nuxt-session=Fe26.2**abc' })))
      .resolves
      .toEqual({ id: 'sealed-id', user: { id: 7, login: 'octocat' } })
  })

  it('treats a carried session with no user as signed out', async () => {
    getUserSession.mockResolvedValue({ id: 'sealed-id' })

    await expect(readUserSession(event({ cookie: 'nuxt-session=Fe26.2**abc' }))).resolves.toBeNull()
  })
})
