import { describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import {
  createGithubAppClient,
  exchangeGithubAppUserCode,
  loadAccountGithubAppUserToken,
  storeAccountGithubAppUserAuthorization,
  verifyGithubWebhookSignature,
} from '../../layers/artifact-delivery/server/utils/github-app'
import { decryptToken, encryptToken } from '../../layers/identity/server/utils/crypto'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200

describe('private GitHub App access', () => {
  it('maps only selected private Repositories visible to the user token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer user-token')
      const url = String(input)
      if (url.includes('/user/installations?')) {
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
          total_count: 2,
          repositories: [
            { id: 7001, name: 'private-skills', private: true, owner: { id: 501, login: 'acme' } },
            { id: 7002, name: 'public-skills', private: false, owner: { id: 501, login: 'acme' } },
          ],
        })
      }
      return Response.json({}, { status: 404 })
    })
    const client = createGithubAppClient({
      appId: 42,
      clientId: 'Iv1.fixture',
      privateKeyPkcs8: 'unused',
      fetch: fetchMock as typeof fetch,
      now: () => NOW,
    })

    const result = await client.selectedRepositoriesForUser('user-token', 9001)

    expect(result).toEqual({
      _tag: 'selected',
      installationId: 9001,
      githubAccountId: 501,
      repositories: [{
        id: 7001,
        name: 'private-skills',
        private: true,
        owner: { id: 501, login: 'acme' },
      }],
    })
  })

  it('creates a token scoped to one Repository with read-only permissions', async () => {
    const keyPair = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    }, true, ['sign', 'verify'])
    const privateKeyPkcs8 = bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)),
    )
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('authorization')
      const body = JSON.parse(String(init?.body)) as unknown
      expect(authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)
      expect(body).toEqual({
        repository_ids: [7001],
        permissions: { contents: 'read', metadata: 'read' },
      })
      return Response.json({
        token: 'ghs_installation_token_with_variable_length',
        expires_at: new Date((NOW + 3600) * 1000).toISOString(),
      })
    })
    const client = createGithubAppClient({
      appId: 42,
      clientId: 'Iv1.fixture',
      privateKeyPkcs8,
      fetch: fetchMock as typeof fetch,
      now: () => NOW,
    })

    const result = await client.createRepositoryToken(9001, 7001)

    expect(result).toMatchObject({
      _tag: 'created',
      token: 'ghs_installation_token_with_variable_length',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('refreshes an expired GitHub App user token and stores the rotated credentials', async () => {
    const fixture = createSqliteD1([
      'migrations/0017_users.sql',
      'migrations/0110_artifact_delivery.sql',
      'migrations/0111_github_app_delivery.sql',
      'migrations/0112_private_artifact_keys.sql',
    ])
    const tokenKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(4)))
    const oldAccessToken = await encryptToken('old-access-token', tokenKey)
    const oldRefreshToken = await encryptToken('old-refresh-token', tokenKey)
    fixture.raw.prepare(
      `INSERT INTO users (id, github_id, login, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(1, 101, 'octocat', NOW, NOW)
    fixture.raw.prepare(
      `INSERT INTO github_app_user_authorizations (
         account_id, access_token_encrypted, access_token_expires_at,
         refresh_token_encrypted, refresh_token_expires_at,
         client_id, authorized_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      oldAccessToken,
      NOW - 1,
      oldRefreshToken,
      NOW + 3600,
      'Iv1.fixture',
      NOW,
      NOW,
    )
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('client_id')).toBe('Iv1.fixture')
      expect(body.get('client_secret')).toBe('fixture-secret')
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('old-refresh-token')
      return Response.json({
        access_token: 'new-access-token',
        expires_in: 28_800,
        refresh_token: 'new-refresh-token',
        refresh_token_expires_in: 15_552_000,
      })
    })

    const token = await loadAccountGithubAppUserToken(fixture.db, 1, {
      tokenKey,
      clientId: 'Iv1.fixture',
      clientSecret: 'fixture-secret',
      fetch: fetchMock as typeof fetch,
      now: () => NOW,
    })

    expect(token).toBe('new-access-token')
    expect(fetchMock).toHaveBeenCalledOnce()
    const stored = fixture.raw.prepare(
      `SELECT access_token_encrypted, access_token_expires_at,
              refresh_token_encrypted, refresh_token_expires_at
       FROM github_app_user_authorizations WHERE account_id = 1`,
    ).get() as Record<string, string | number>
    expect(await decryptToken(String(stored.access_token_encrypted), tokenKey)).toBe('new-access-token')
    expect(stored.access_token_expires_at).toBe(NOW + 28_800)
    expect(await decryptToken(String(stored.refresh_token_encrypted), tokenKey)).toBe('new-refresh-token')
    expect(stored.refresh_token_expires_at).toBe(NOW + 15_552_000)
    fixture.close()
  })

  it('keeps normal login credentials separate from opt-in GitHub App access', async () => {
    const fixture = createSqliteD1([
      'migrations/0017_users.sql',
      'migrations/0110_artifact_delivery.sql',
      'migrations/0111_github_app_delivery.sql',
      'migrations/0112_private_artifact_keys.sql',
    ])
    const tokenKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)))
    const loginToken = await encryptToken('normal-login-token', tokenKey)
    fixture.raw.prepare(
      `INSERT INTO users (
         id, github_id, login, github_token_encrypted,
         github_token_scopes, created_at, last_login_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(1, 101, 'octocat', loginToken, 'read:user user:email', NOW, NOW)

    await storeAccountGithubAppUserAuthorization(fixture.db, 1, {
      accessToken: 'private-access-token',
      accessTokenExpiresAt: NOW + 28_800,
      refreshToken: 'private-refresh-token',
      refreshTokenExpiresAt: NOW + 15_552_000,
    }, {
      tokenKey,
      clientId: 'Iv1.private',
      clientSecret: 'private-secret',
      fetch,
      now: () => NOW,
    })

    const storedLogin = fixture.raw.prepare(
      'SELECT github_token_encrypted FROM users WHERE id = 1',
    ).get() as { github_token_encrypted: string }
    expect(await decryptToken(storedLogin.github_token_encrypted, tokenKey)).toBe('normal-login-token')
    expect(await loadAccountGithubAppUserToken(fixture.db, 1, {
      tokenKey,
      clientId: 'Iv1.private',
      clientSecret: 'private-secret',
      fetch,
      now: () => NOW,
    })).toBe('private-access-token')
    fixture.close()
  })

  it('exchanges the opt-in App code and binds it to one GitHub user', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === 'https://github.com/login/oauth/access_token') {
        const body = new URLSearchParams(String(init?.body))
        expect(body.get('client_id')).toBe('Iv1.private')
        expect(body.get('client_secret')).toBe('private-secret')
        expect(body.get('code')).toBe('authorization-code')
        return Response.json({
          access_token: 'private-access-token',
          expires_in: 28_800,
          refresh_token: 'private-refresh-token',
          refresh_token_expires_in: 15_552_000,
        })
      }
      expect(String(input)).toBe('https://api.github.com/user')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-access-token')
      return Response.json({ id: 101, login: 'octocat' })
    })

    const result = await exchangeGithubAppUserCode('authorization-code', {
      tokenKey: 'unused',
      clientId: 'Iv1.private',
      clientSecret: 'private-secret',
      fetch: fetchMock as typeof fetch,
      now: () => NOW,
    })

    expect(result).toEqual({
      _tag: 'authorized',
      githubUserId: 101,
      accessToken: 'private-access-token',
      accessTokenExpiresAt: NOW + 28_800,
      refreshToken: 'private-refresh-token',
      refreshTokenExpiresAt: NOW + 15_552_000,
    })
  })

  it('accepts the exact webhook bytes and rejects changed bytes', async () => {
    const secret = 'webhook-secret'
    const body = new TextEncoder().encode('{"action":"removed"}')
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, body))
    const signature = `sha256:${hex(digest)}`.replace(':', '=')
    const changed = new TextEncoder().encode('{"action":"added"}')

    expect(await verifyGithubWebhookSignature(secret, body, signature)).toBe(true)
    expect(await verifyGithubWebhookSignature(secret, changed, signature)).toBe(false)
  })
})

function hex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
