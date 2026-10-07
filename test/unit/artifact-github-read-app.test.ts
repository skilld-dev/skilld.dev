import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { GithubCredentialReport } from '../../shared/server/github-app-credential'
import { describe, expect, it } from 'vitest'
import { createArtifactGithubSource } from '../../layers/artifact-delivery/server/utils/queue'
import { createInstallationTokenCache } from '../../shared/server/github-app-credential'

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
    const reports: GithubCredentialReport[] = []
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) }))

    await source.resolve(request)

    expect(github.readAuthorizations).toEqual(['Bearer runs'])
    expect(reports).toEqual([{ outcome: 'app-token-unavailable', reason: 'GitHub refused the installation token (401)', fallback: 'ARTIFACT_GITHUB_TOKEN' }])
  })

  it('reports an unreadable App key and reads with the fallback token', async () => {
    const github = fakeGithub({ expiresAt: NOW + 3600 })
    const reports: GithubCredentialReport[] = []
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
    const reports: GithubCredentialReport[] = []
    await createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) })).resolve(request)

    const text = JSON.stringify(reports)
    expect(text).not.toContain('runs')
    expect(text).not.toContain('site')
    expect(text).not.toContain('PRIVATE KEY')
    expect(reports).toHaveLength(1)
  })

  // A JSON parse error quotes the start of the body, which holds the token.
  it('never puts part of a malformed installation token answer in a report', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, mintBody: '{"token":ghs_SECRETVALUE"}' })
    const reports: GithubCredentialReport[] = []
    await createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) })).resolve(request)

    expect(reports).toHaveLength(1)
    expect(JSON.stringify(reports)).not.toContain('ghs_')
  })

  it('repeats a read the Repository denied the read App with the fallback token, and reports it', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, answersApp: appDenied })
    const reports: GithubCredentialReport[] = []
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) }))

    const result = await source.resolve(request)

    expect(github.readAuthorizations).toEqual(['Bearer ghs_installation_1', 'Bearer runs'])
    // The fallback read reached GitHub, which has no such Repository.
    expect(result).toMatchObject({ _tag: 'rejected', code: 'SOURCE_NOT_FOUND' })
    expect(reports).toEqual([{ outcome: 'app-denied', reason: 'GitHub denied the read App for skilld-dev/skills', fallback: 'ARTIFACT_GITHUB_TOKEN' }])
  })

  // GITHUB_TOKEN is a personal token the registry sync also spends. A limit on
  // the App is no denial, so it never reaches that token.
  it.each([
    ['a secondary limit named only in its message', () => Response.json(
      { message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' },
      { status: 403, headers: { 'x-ratelimit-remaining': '4321' } },
    )],
    ['a secondary limit with Retry-After', () => Response.json(
      { message: 'You have exceeded a secondary rate limit.' },
      { status: 403, headers: { 'retry-after': '60', 'x-ratelimit-remaining': '4321' } },
    )],
    ['a spent quota', () => Response.json(
      { message: `API rate limit exceeded for installation ID ${INSTALLATION_ID}.` },
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW + 600) } },
    )],
  ])('never reads with the fallback token after %s on the read App', async (_, answer) => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, answersApp: answer })
    const reports: GithubCredentialReport[] = []
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) }))

    const result = await source.resolve(request)

    expect(github.readAuthorizations).toEqual(['Bearer ghs_installation_1'])
    expect(result).toMatchObject({ _tag: 'rejected', code: 'RATE_LIMITED' })
    expect(reports).toEqual([])
  })

  it('keeps the denial when no token follows the read App', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, answersApp: appDenied })
    const env = { ...appEnv(keys.pem), ARTIFACT_GITHUB_TOKEN: '', GITHUB_TOKEN: '' }

    const result = await createArtifactGithubSource(env, runtime(github)).resolve(request)

    expect(github.readAuthorizations).toEqual(['Bearer ghs_installation_1'])
    expect(result).toMatchObject({
      _tag: 'rejected',
      code: 'SOURCE_ACCESS_DENIED',
      summary: 'GitHub denies the skilld.dev read App access to this Repository, and no fallback token is set.',
    })
  })
})

// An installation token can stop working before the expiry GitHub gave it.
// A 401 names the token, not the Repository, so one new token fixes it.
describe('a build read GitHub answered 401 for the cached installation token', () => {
  it('mints one new token and repeats the read with it, not with a fallback token', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, rejects: ['ghs_installation_1'] })
    const reports: GithubCredentialReport[] = []
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) }))

    const result = await source.resolve(request)

    expect(github.mints).toHaveLength(2)
    expect(github.readAuthorizations).toEqual(['Bearer ghs_installation_1', 'Bearer ghs_installation_2'])
    expect(result).toMatchObject({ _tag: 'rejected', code: 'SOURCE_NOT_FOUND' })
    expect(reports).toEqual([])
  })

  it('reads with the fallback token, and reports it, when GitHub rejects the new token too', async () => {
    const keys = await appKeys()
    const github = fakeGithub({ expiresAt: NOW + 3600, rejects: ['ghs_installation_1', 'ghs_installation_2'] })
    const reports: GithubCredentialReport[] = []
    const source = createArtifactGithubSource(appEnv(keys.pem), runtime(github, { report: event => reports.push(event) }))

    await source.resolve(request)

    expect(github.readAuthorizations).toEqual(['Bearer ghs_installation_1', 'Bearer ghs_installation_2', 'Bearer runs'])
    expect(reports).toEqual([{
      outcome: 'app-token-rejected',
      reason: 'GitHub rejected a new read App installation token for skilld-dev/skills',
      fallback: 'ARTIFACT_GITHUB_TOKEN',
    }])
  })
})

interface FakeGithub {
  fetch: typeof fetch
  mints: Array<{ url: string, authorization: string, body: unknown }>
  readAuthorizations: Array<string | null>
}

// Some organizations answer the read App 403 on a public Repository that a
// personal token reads: neondatabase/agent-skills on 2026-10-06.
function appDenied(): Response {
  return Response.json({ message: 'Resource not accessible by integration' }, { status: 403, headers: { 'x-ratelimit-remaining': '4321' } })
}

/** Answers every read 404, every read with an installation token `answersApp` when set, and 401 to a token in `rejects`. */
function fakeGithub(options: { expiresAt: number, mintStatus?: number, mintBody?: string, answersApp?: () => Response, rejects?: string[] }): FakeGithub {
  const mints: FakeGithub['mints'] = []
  const readAuthorizations: FakeGithub['readAuthorizations'] = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (url.includes('/access_tokens')) {
      mints.push({ url, authorization: headers.get('authorization') ?? '', body: JSON.parse(String(init?.body)) })
      if (options.mintStatus)
        return new Response('{}', { status: options.mintStatus })
      if (options.mintBody)
        return new Response(options.mintBody, { status: 201 })
      return Response.json({ token: `ghs_installation_${mints.length}`, expires_at: new Date(options.expiresAt * 1000).toISOString() }, { status: 201 })
    }
    const authorization = headers.get('authorization')
    readAuthorizations.push(authorization)
    if (authorization && options.rejects?.includes(authorization.slice('Bearer '.length)))
      return Response.json({ message: 'Bad credentials' }, { status: 401 })
    if (options.answersApp && authorization?.startsWith('Bearer ghs_'))
      return options.answersApp()
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }
  return { fetch: fetcher as typeof fetch, mints, readAuthorizations }
}

function runtime(
  github: FakeGithub,
  overrides: Partial<{ cache: ReturnType<typeof createInstallationTokenCache>, now: () => number, report: (event: GithubCredentialReport) => void }> = {},
) {
  return {
    fetch: github.fetch,
    now: overrides.now ?? (() => NOW),
    tokenCache: overrides.cache ?? createInstallationTokenCache(),
    report: overrides.report ?? (() => {}),
    random: () => 0.5,
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
