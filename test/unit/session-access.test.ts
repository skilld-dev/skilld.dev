import { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decideSessionAccess, readUserSession } from '../../shared/server/session-access'

// `getUserSession` mints a session and sets its cookie whenever a request
// arrives without one. Reading the session on an anonymous request is what put
// a session cookie on `/api/skills`, and a response that sets a cookie
// is never stored by a shared cache.
describe('decideSessionAccess', () => {
  it.each([
    { name: 'no cookie header', cookie: null, expected: 'anonymous' },
    { name: 'empty cookie header', cookie: '', expected: 'anonymous' },
    { name: 'unrelated cookies only', cookie: 'theme=dark; __cf_bm=abc', expected: 'anonymous' },
    { name: 'a cleared session cookie', cookie: 'nuxt-auth-session=', expected: 'anonymous' },
    { name: 'a cookie whose name only ends with the session name', cookie: 'old-nuxt-auth-session=sealed', expected: 'anonymous' },
    { name: 'the old session cookie', cookie: 'nuxt-session=sealed', expected: 'anonymous' },
    { name: 'the session cookie', cookie: 'nuxt-auth-session=sealed', expected: 'carried' },
    { name: 'the session cookie among others', cookie: 'theme=dark;  nuxt-auth-session=sealed ; x=1', expected: 'carried' },
  ])('$name is $expected', ({ cookie, expected }) => {
    expect(decideSessionAccess(cookie)._tag).toBe(expected)
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
    return new H3Event(new Request('https://skilld.dev/api/_auth/session', { headers }))
  }

  it('never opens a session for an anonymous request', async () => {
    await expect(readUserSession(event({ cookie: 'theme=dark' }))).resolves.toBeNull()
    expect(getUserSession).not.toHaveBeenCalled()
  })

  it('reads the session a request carries', async () => {
    await expect(readUserSession(event({ cookie: 'nuxt-auth-session=sealed' })))
      .resolves
      .toEqual({ id: 'sealed-id', user: { id: 7, login: 'octocat' } })
  })

  it('treats a carried session with no user as signed out', async () => {
    getUserSession.mockResolvedValue({ id: 'sealed-id' })

    await expect(readUserSession(event({ cookie: 'nuxt-auth-session=sealed' }))).resolves.toBeNull()
  })
})
