import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactGithubCredentialReport } from '../../layers/artifact-delivery/server/utils/github-read-credential'
import { describe, expect, it } from 'vitest'
import { createInstallationTokenCache } from '../../layers/artifact-delivery/server/utils/github-read-credential'
import { createArtifactGithubSource } from '../../layers/artifact-delivery/server/utils/queue'

// Builds shared the site token with the hourly registry sync and every `/gh`
// page view, so a run failed RATE_LIMITED whenever the sync spent it. The read
// App's installation has its own bucket of 5,000 requests an hour.
const APP_ID = '5212127'
const INSTALLATION_ID = '168540695'
const NOW = 1_791_300_000
const request: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'path', path: 'skills/demo' },
}

describe('the GitHub credential public Artifact builds read with', () => {
  it('reads with the read App installation token when the App secrets are set', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600 })
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github))

    await source.resolve(request)

    expect(github.mints).toHaveLength(1)
    expect(github.mints[0]!.url).toBe(`https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`)
    expect(github.mints[0]!.body).toEqual({ permissions: { metadata: 'read' } })
    const claims = await verifiedJwtClaims(github.mints[0]!.authorization, keys.publicKey)
    expect(claims.iss).toBe(APP_ID)
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600)
    expect(github.readAuthorizations).toEqual(['Bearer ghs_installation_1'])
  })

  it('reuses one installation token until five minutes before it expires', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600 })
    const clock = { now: NOW }
    const cache = createInstallationTokenCache()
    const read = () => createArtifactGithubSource(appEnv(keys.pem), runtime(github, { cache, now: () => clock.now })).resolve(request)

    await read()
    clock.now = NOW + 3600 - 301
    await read()
    expect(github.mints).toHaveLength(1)

    clock.now = NOW + 3600 - 300
    await read()
    expect(github.mints).toHaveLength(2)
    expect(github.readAuthorizations).toEqual([
      'Bearer ghs_installation_1',
      'Bearer ghs_installation_1',
      'Bearer ghs_installation_2',
    ])
  })

  it('mints once for reads that start together', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600 })
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github))

    await Promise.all([source.resolve(request), source.resolve(request), source.resolve(request)])

    expect(github.mints).toHaveLength(1)
  })

  it('accepts a PEM whose line breaks were stored as \\n', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600 })
    const source = createArtifactGithubSource(appEnv(keys.pem.replaceAll('\n', '\\n')), runtime(github))

    await source.resolve(request)

    expect(github.readAuthorizations).toEqual(['Bearer ghs_installation_1'])
  })

  it('falls back to ARTIFACT_GITHUB_TOKEN, then GITHUB_TOKEN, without the App secrets', async () => {
    const both = fakeGithub({ expiresAt: NOW + 3600 })
    await createArtifactGithubSource({ ARTIFACT_GITHUB_TOKEN: 'runs', GITHUB_TOKEN: 'site' }, runtime(both)).resolve(request)
    const siteOnly = fakeGithub({ expiresAt: NOW + 3600 })
    await createArtifactGithubSource({ ARTIFACT_GITHUB_TOKEN: '', GITHUB_TOKEN: 'site' }, runtime(siteOnly)).resolve(request)

    expect(both.mints).toHaveLength(0)
    expect(both.readAuthorizations).toEqual(['Bearer runs'])
    expect(siteOnly.readAuthorizations).toEqual(['Bearer site'])
  })

  it('reads with the fallback token, and reports why, when GitHub refuses the installation token', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, mintStatus: 401 })
    const reports: ArtifactGithubCredentialReport[] = []
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) }))

    await source.resolve(request)

    expect(github.readAuthorizations).toEqual(['Bearer runs'])
    expect(reports).toEqual([{ outcome: 'app-token-unavailable', reason: 'GitHub refused the installation token (401)', fallback: 'ARTIFACT_GITHUB_TOKEN' }])
  })

  it('reports an unreadable App key and reads with the fallback token', async () => {
    const github = fakeGithub({ expiresAt: NOW + 3600 })
    const reports: ArtifactGithubCredentialReport[] = []
    const env = { ...appEnv('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----'), ARTIFACT_GITHUB_TOKEN: '' }
    const source = createArtifactGithubSource(env, runtime(github, { report: event => reports.push(event) }))

    await source.resolve(request)

    expect(github.mints).toHaveLength(0)
    expect(github.readAuthorizations).toEqual(['Bearer site'])
    expect(reports).toEqual([{ outcome: 'app-misconfigured', reason: 'SKILLD_READ_APP_PRIVATE_KEY_PKCS8 is not a PKCS #8 PEM private key', fallback: 'GITHUB_TOKEN' }])
  })

  it('never puts a token or the key in a report', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, mintStatus: 500 })
    const reports: ArtifactGithubCredentialReport[] = []
    await createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) })).resolve(request)

    const text = JSON.stringify(reports)
    expect(text).not.toContain('runs')
    expect(text).not.toContain('site')
    expect(text).not.toContain('PRIVATE KEY')
    expect(reports).toHaveLength(1)
  })
})

interface FakeGithub {
  fetch: typeof fetch
  mints: Array<{ url: string, authorization: string, body: unknown }>
  readAuthorizations: Array<string | null>
}

function fakeGithub(options: { expiresAt: number, mintStatus?: number }): FakeGithub {
  const mints: FakeGithub['mints'] = []
  const readAuthorizations: FakeGithub['readAuthorizations'] = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (url.includes('/access_tokens')) {
      mints.push({ url, authorization: headers.get('authorization') ?? '', body: JSON.parse(String(init?.body)) })
      if (options.mintStatus)
        return new Response('{}', { status: options.mintStatus })
      return Response.json({ token: `ghs_installation_${mints.length}`, expires_at: new Date(options.expiresAt * 1000).toISOString() }, { status: 201 })
    }
    readAuthorizations.push(headers.get('authorization'))
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }
  return { fetch: fetcher as typeof fetch, mints, readAuthorizations }
}

function runtime(
  github: FakeGithub,
  overrides: Partial<{ cache: ReturnType<typeof createInstallationTokenCache>, now: () => number, report: (event: ArtifactGithubCredentialReport) => void }> = {},
) {
  return {
    fetch: github.fetch,
    now: overrides.now ?? (() => NOW),
    tokenCache: overrides.cache ?? createInstallationTokenCache(),
    report: overrides.report ?? (() => {}),
  }
}

function appEnv(pem: string) {
  return {
    SKILLD_READ_APP_ID: APP_ID,
    SKILLD_READ_APP_INSTALLATION_ID: INSTALLATION_ID,
    SKILLD_READ_APP_PRIVATE_KEY_PKCS8: pem,
    ARTIFACT_GITHUB_TOKEN: 'runs',
    GITHUB_TOKEN: 'site',
  }
}

async function appKeys(): Promise<{ pem: string, publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer)
  const base64 = btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join('\n')
  return { pem: `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey }
}

async function verifiedJwtClaims(authorization: string, publicKey: CryptoKey): Promise<{ iss: string, iat: number, exp: number }> {
  const jwt = authorization.replace(/^Bearer /, '')
  const [header, payload, signature] = jwt.split('.') as [string, string, string]
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    base64UrlBytes(signature),
    new TextEncoder().encode(`${header}.${payload}`),
  )
  expect(valid).toBe(true)
  expect(JSON.parse(new TextDecoder().decode(base64UrlBytes(header)))).toEqual({ alg: 'RS256', typ: 'JWT' })
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(payload)))
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
