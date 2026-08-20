import { describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import {
  createGithubAppClient,
  verifyGithubWebhookSignature,
} from '../../layers/artifact-delivery/server/utils/github-app'

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
