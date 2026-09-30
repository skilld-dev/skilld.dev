import type { EventHandler, H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { githubConnectionReturnTo } from '../../layers/artifact-delivery/server/utils/github-connection-flow'
import { decryptToken, encryptToken } from '../../layers/identity/server/utils/crypto'
import { createSqliteD1 } from './helpers/d1-sqlite'
import { SIGNED_IN_HEADERS } from './helpers/session'

const NOW = 1_787_227_200
const TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(6)))
const cookies = new Map<string, string>()
const responseHeaders = new Map<string, string | string[]>()

describe('opt-in GitHub App connection routes', () => {
  let fixture: ReturnType<typeof createSqliteD1>
  let event: H3Event

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW * 1000)
    cookies.clear()
    // The browser arrives signed in; the routes add their state cookies to it.
    rememberCookies(SIGNED_IN_HEADERS.cookie!)
    responseHeaders.clear()
    fixture = createSqliteD1([
      'migrations/0017_users.sql',
      'migrations/0110_artifact_delivery.sql',
      'migrations/0111_github_app_delivery.sql',
      'migrations/0112_private_artifact_keys.sql',
    ])
    const loginToken = await encryptToken('normal-oauth-token', TOKEN_KEY)
    fixture.raw.prepare(
      `INSERT INTO users (
         id, github_id, login, github_token_encrypted,
         github_token_scopes, created_at, last_login_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(1, 101, 'octocat', loginToken, 'read:user user:email', NOW, NOW)
    event = {
      method: 'GET',
      context: {
        platform: {
          db: fixture.db,
          env: await githubEnv(),
        },
      },
      node: {
        req: { headers: { ...SIGNED_IN_HEADERS } },
        res: {
          end: () => undefined,
          statusCode: 200,
          getHeader: (name: string) => responseHeaders.get(name.toLowerCase()),
          appendHeader: (name: string, value: string) => {
            const key = name.toLowerCase()
            const current = responseHeaders.get(key)
            const values = current === undefined
              ? [value]
              : [...(Array.isArray(current) ? current : [current]), value]
            responseHeaders.set(key, values)
            if (key === 'set-cookie')
              rememberCookies(value)
          },
          removeHeader: (name: string) => responseHeaders.delete(name.toLowerCase()),
          setHeader: (name: string, value: string | string[]) => {
            responseHeaders.set(name.toLowerCase(), value)
            if (name.toLowerCase() === 'set-cookie')
              rememberCookies(value)
          },
        },
      },
    } as H3Event

    vi.stubGlobal('defineEventHandler', (handler: EventHandler) => handler)
    vi.stubGlobal('getUserSession', () => Promise.resolve({
      user: { id: 1, login: 'octocat' },
    }))
  })

  afterEach(() => {
    fixture.close()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('hides the GitHub App while private Artifact access is disabled', async () => {
    event.context.platform!.env = await githubEnv(false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('getQuery', () => ({ return_to: '/me' }))
    const authorize = (await import(
      '../../layers/artifact-delivery/server/api/v1/github/connections/authorize.get',
    )).default

    await expect(authorize(event)).rejects.toMatchObject({ statusCode: 404 })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(responseHeaders.get('location')).toBeUndefined()
  })

  it('keeps normal OAuth login while the private connection completes', async () => {
    const fetchMock = githubFetch(101)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('getQuery', () => ({ return_to: '/me' }))
    const authorize = (await import(
      '../../layers/artifact-delivery/server/api/v1/github/connections/authorize.get',
    )).default

    await authorize(event)
    const installUrl = new URL(String(responseHeaders.get('location')))
    const state = installUrl.searchParams.get('state')
    expect(installUrl.origin + installUrl.pathname)
      .toBe('https://github.com/apps/skilld-private/installations/new')
    expect(state).toMatch(/^[\w-]{43}$/)

    event.node.req.headers.cookie = serializeCookies()
    responseHeaders.clear()
    vi.stubGlobal('getQuery', () => ({
      code: 'private-code',
      installation_id: '9001',
      setup_action: 'install',
      state,
    }))
    const callback = (await import(
      '../../layers/artifact-delivery/server/api/v1/github/connections/callback.get',
    )).default

    await callback(event)

    expect(responseHeaders.get('location')).toBe('/me')
    expect(fixture.raw.prepare(
      'SELECT account_id FROM github_app_user_authorizations',
    ).all()).toEqual([{ account_id: 1 }])
    expect(fixture.raw.prepare(
      'SELECT installation_id, account_id FROM github_app_installations',
    ).all()).toEqual([{ installation_id: 9001, account_id: 1 }])
    const login = fixture.raw.prepare(
      'SELECT github_token_encrypted FROM users WHERE id = 1',
    ).get() as { github_token_encrypted: string }
    expect(await decryptToken(login.github_token_encrypted, TOKEN_KEY)).toBe('normal-oauth-token')
  })

  it('rejects an App authorization from another GitHub user', async () => {
    vi.stubGlobal('fetch', githubFetch(202))
    vi.stubGlobal('getQuery', () => ({ return_to: '/me' }))
    const authorize = (await import(
      '../../layers/artifact-delivery/server/api/v1/github/connections/authorize.get',
    )).default
    await authorize(event)
    const state = new URL(String(responseHeaders.get('location'))).searchParams.get('state')
    event.node.req.headers.cookie = serializeCookies()
    responseHeaders.clear()
    vi.stubGlobal('getQuery', () => ({
      code: 'other-user-code',
      installation_id: '9001',
      setup_action: 'install',
      state,
    }))
    const callback = (await import(
      '../../layers/artifact-delivery/server/api/v1/github/connections/callback.get',
    )).default

    await expect(callback(event)).rejects.toMatchObject({ statusCode: 403 })

    expect(fixture.raw.prepare(
      'SELECT COUNT(*) AS count FROM github_app_user_authorizations',
    ).get()).toEqual({ count: 0 })
    expect(fixture.raw.prepare(
      'SELECT COUNT(*) AS count FROM github_app_installations',
    ).get()).toEqual({ count: 0 })
  })
})

describe('return location for GitHub App', () => {
  it('keeps redirects on skilld.dev', () => {
    expect(githubConnectionReturnTo('/account?tab=private')).toBe('/account?tab=private')
    expect(githubConnectionReturnTo('/\\attacker.example')).toBe('/me')
    expect(githubConnectionReturnTo('//attacker.example')).toBe('/me')
    expect(githubConnectionReturnTo('//[')).toBe('/me')
    expect(githubConnectionReturnTo('https://attacker.example')).toBe('/me')
  })
})

function rememberCookies(value: string | string[]): void {
  for (const serialized of Array.isArray(value) ? value : [value]) {
    const [pair] = serialized.split(';')
    const separator = pair!.indexOf('=')
    const name = pair!.slice(0, separator)
    const cookieValue = pair!.slice(separator + 1)
    if (cookieValue)
      cookies.set(name, cookieValue)
    else
      cookies.delete(name)
  }
}

function serializeCookies(): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

async function githubEnv(privateAccessEnabled = true) {
  const keyPair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify'])
  return {
    ARTIFACT_PRIVATE_ACCESS_ENABLED: privateAccessEnabled ? 'true' : '',
    GITHUB_APP_ID: '42',
    GITHUB_APP_CLIENT_ID: 'Iv1.private',
    GITHUB_APP_CLIENT_SECRET: 'private-secret',
    GITHUB_APP_PRIVATE_KEY_PKCS8: bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)),
    ),
    GITHUB_APP_WEBHOOK_SECRET: 'webhook-secret',
    ARTIFACT_KEY_WRAP_KEY_PRIMARY: 'wrapping-key',
    ARTIFACT_GRANT_IDEMPOTENCY_KEY: 'grant-secret',
    NUXT_TOKEN_KEY: TOKEN_KEY,
  } as Cloudflare.Env
}

function githubFetch(githubUserId: number) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === 'https://api.github.com/app')
      return Response.json({ slug: 'skilld-private' })
    if (url === 'https://github.com/login/oauth/access_token') {
      return Response.json({
        access_token: 'private-access-token',
        expires_in: 28_800,
        refresh_token: 'private-refresh-token',
        refresh_token_expires_in: 15_552_000,
      })
    }
    if (url === 'https://api.github.com/user')
      return Response.json({ id: githubUserId, login: 'octocat' })
    if (url.includes('/user/installations?')) {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-access-token')
      return Response.json({
        total_count: 1,
        installations: [{
          id: 9001,
          app_id: 42,
          account: { id: 501 },
          repository_selection: 'selected',
          suspended_at: null,
        }],
      })
    }
    if (url.includes('/user/installations/9001/repositories?')) {
      return Response.json({
        total_count: 1,
        repositories: [{
          id: 7001,
          name: 'private-skills',
          private: true,
          owner: { id: 501, login: 'acme' },
        }],
      })
    }
    return Response.json({}, { status: 404 })
  })
}
