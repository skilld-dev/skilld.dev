import type { EventHandler, H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptToken } from '../../layers/identity/server/utils/crypto'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
const OCTOCAT = 9001
const HUBOT = 9002
const TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))

interface CredentialRow {
  github_token_encrypted: string | null
  github_token_scopes: string | null
  github_token_expires_at: number | null
  github_refresh_token_encrypted: string | null
  github_refresh_token_expires_at: number | null
  github_token_client_id: string | null
}

describe('web sign-out and stored GitHub credentials', () => {
  let fixture: ReturnType<typeof createSqliteD1>
  let event: H3Event
  let sessionUserId: number | null

  beforeEach(async () => {
    vi.resetModules()
    fixture = createSqliteD1(allMigrations())
    for (const [id, login] of [[OCTOCAT, 'octocat'], [HUBOT, 'hubot']] as const) {
      fixture.raw.prepare(
        `INSERT INTO users (
           id, github_id, login, github_token_encrypted, github_token_scopes,
           github_token_expires_at, github_refresh_token_encrypted,
           github_refresh_token_expires_at, github_token_client_id,
           created_at, last_login_at
         ) VALUES (?, ?, ?, ?, 'read:user', ?, ?, ?, 'client', ?, ?)`,
      ).run(
        id,
        900_000 + id,
        login,
        await encryptToken(`access-${login}`, TOKEN_KEY),
        NOW + 3600,
        await encryptToken(`refresh-${login}`, TOKEN_KEY),
        NOW + 86_400,
        NOW,
        NOW,
      )
    }
    sessionUserId = OCTOCAT
    event = {
      method: 'POST',
      context: { platform: { db: fixture.db } },
      node: { req: { headers: {} } },
    } as unknown as H3Event
    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('readBody', () => Promise.resolve({}))
    vi.stubGlobal('useRuntimeConfig', () => ({ tokenKey: TOKEN_KEY }))
    vi.stubGlobal('getUserSession', () => Promise.resolve(
      sessionUserId === null ? {} : { user: { id: sessionUserId, login: 'octocat' } },
    ))
    vi.stubGlobal('clearUserSession', () => {
      sessionUserId = null
      return Promise.resolve(true)
    })
  })

  afterEach(() => {
    fixture.close()
    vi.unstubAllGlobals()
  })

  function credentials(userId: number): CredentialRow {
    return fixture.raw.prepare(
      `SELECT github_token_encrypted, github_token_scopes, github_token_expires_at,
              github_refresh_token_encrypted, github_refresh_token_expires_at,
              github_token_client_id
       FROM users WHERE id = ?`,
    ).get(userId) as unknown as CredentialRow
  }

  it('deletes the GitHub tokens of the account that signs out', async () => {
    const logout = (await import('../../layers/identity/server/api/auth/logout.post')).default

    await expect(logout(event)).resolves.toEqual({ ok: true })

    expect(credentials(OCTOCAT)).toEqual({
      github_token_encrypted: null,
      github_token_scopes: null,
      github_token_expires_at: null,
      github_refresh_token_encrypted: null,
      github_refresh_token_expires_at: null,
      github_token_client_id: null,
    })
    expect(credentials(HUBOT).github_token_encrypted).not.toBeNull()
    expect(credentials(HUBOT).github_refresh_token_encrypted).not.toBeNull()
  })

  it('asks for a new GitHub sign-in when another session imports stars after sign-out', async () => {
    const logout = (await import('../../layers/identity/server/api/auth/logout.post')).default
    const importStars = (await import('../../layers/identity/server/api/me/stars/sync.post')).default
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await logout(event)
    sessionUserId = OCTOCAT

    await expect(importStars(event)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Your GitHub access ended when you signed out. Sign in with GitHub again.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks for a new GitHub sign-in when another session scans repositories after sign-out', async () => {
    const logout = (await import('../../layers/identity/server/api/auth/logout.post')).default
    const scan = (await import('../../layers/identity/server/api/me/repos/scan.post')).default

    await logout(event)
    sessionUserId = OCTOCAT

    await expect(scan(event)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Your GitHub access ended when you signed out. Sign in with GitHub again.',
    })
  })
})
