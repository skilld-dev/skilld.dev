import { z } from 'zod'

/**
 * The read App's GitHub credential, shared by every Worker caller.
 *
 * GitHub counts a personal token's quota per account, so every token of one
 * account shares one bucket, and the account owner's own tools spend it too.
 * The read App (`skilld-dev-registry-reads`, metadata read only) has an
 * installation with a bucket of its own. A personal token remains only as the
 * fallback for a Repository whose organization denies the App.
 */

const GITHUB_API = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'
const GITHUB_REQUEST_TIMEOUT_MS = 15_000
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024

/**
 * Renew an installation token this long before GitHub says it expires, so a
 * read that starts with it never sees it lapse part way through.
 */
export const INSTALLATION_TOKEN_RENEW_SECONDS = 5 * 60

/** The read App: metadata read only, installed on skilld-dev. */
export interface ReadAppConfig {
  appId: number
  installationId: number
  privateKeyPkcs8: Uint8Array
}

/** A personal token a caller may fall back to, by its secret name. */
export interface FallbackToken {
  name: 'ARTIFACT_GITHUB_TOKEN' | 'GITHUB_TOKEN'
  token: string
}

/** Where a caller's GitHub credential comes from, parsed once from the Worker env. */
export type GithubCredentialConfig
  = | { _tag: 'app', app: ReadAppConfig, fallback: FallbackToken | null }
    /** App secrets are set but unusable. Reads use the fallback and report why. */
    | { _tag: 'app-misconfigured', reason: string, fallback: FallbackToken | null }
    /** No App secret is set, as in local development and tests. */
    | { _tag: 'token', token: FallbackToken }
    | { _tag: 'anonymous' }

export interface GithubCredentialEnv {
  SKILLD_READ_APP_ID?: string
  SKILLD_READ_APP_INSTALLATION_ID?: string
  SKILLD_READ_APP_PRIVATE_KEY_PKCS8?: string
  ARTIFACT_GITHUB_TOKEN?: string
  GITHUB_TOKEN?: string
}

/**
 * Why a read used a token other than the App's, or found none. It names
 * secrets and paths, never a token value.
 */
export interface GithubCredentialReport {
  outcome: 'app-misconfigured' | 'app-token-unavailable' | 'app-denied'
  reason: string
  fallback: FallbackToken['name'] | 'anonymous' | 'none'
}

interface CachedInstallationToken {
  token: string
  /** Unix seconds. */
  expiresAt: number
}

/**
 * Installation tokens kept between reads in one isolate. A token lives an
 * hour; minting one per read would add a request and a signature to each.
 */
export interface InstallationTokenCache {
  tokens: Map<string, CachedInstallationToken>
  pending: Map<string, Promise<CachedInstallationToken | { _tag: 'unavailable', reason: string }>>
}

export function createInstallationTokenCache(): InstallationTokenCache {
  return { tokens: new Map(), pending: new Map() }
}

let isolateTokenCache: InstallationTokenCache | null = null

/**
 * The one installation token cache of this isolate, so the registry and the
 * build queue share a token instead of minting one each.
 */
export function isolateInstallationTokenCache(): InstallationTokenCache {
  isolateTokenCache ??= createInstallationTokenCache()
  return isolateTokenCache
}

export interface GithubCredentialRuntime {
  fetch: typeof globalThis.fetch
  /** Unix seconds. */
  now: () => number
  tokenCache: InstallationTokenCache
  report: (event: GithubCredentialReport) => void
}

/** The credential for one GitHub read. An undefined token reads anonymously. */
export interface GithubReadCredential {
  token: string | undefined
  /** The read App's installation token, which a Repository can deny. */
  isApp: boolean
}

export interface GithubCredential {
  current: () => Promise<GithubReadCredential>
  /** The token for a read GitHub denied the App, or null. */
  fallback: FallbackToken | null
}

/**
 * Parse the read App secrets and the caller's fallback tokens, in order.
 *
 * With no App secret at all, the first fallback token becomes the primary
 * credential, which is what local development runs on.
 */
export function parseGithubCredentialConfig(
  env: GithubCredentialEnv,
  fallbackNames: ReadonlyArray<FallbackToken['name']>,
): GithubCredentialConfig {
  const fallback = firstToken(env, fallbackNames)
  const appSecrets = [env.SKILLD_READ_APP_ID, env.SKILLD_READ_APP_INSTALLATION_ID, env.SKILLD_READ_APP_PRIVATE_KEY_PKCS8]
  if (appSecrets.every(value => !value?.trim()))
    return fallback ? { _tag: 'token', token: fallback } : { _tag: 'anonymous' }
  const misconfigured = (reason: string): GithubCredentialConfig => ({ _tag: 'app-misconfigured', reason, fallback })
  const appId = positiveInteger(env.SKILLD_READ_APP_ID)
  if (appId === null)
    return misconfigured('SKILLD_READ_APP_ID is not a GitHub App ID')
  const installationId = positiveInteger(env.SKILLD_READ_APP_INSTALLATION_ID)
  if (installationId === null)
    return misconfigured('SKILLD_READ_APP_INSTALLATION_ID is not an installation ID')
  const privateKeyPkcs8 = pkcs8PemBytes(env.SKILLD_READ_APP_PRIVATE_KEY_PKCS8 ?? '')
  if (!privateKeyPkcs8)
    return misconfigured('SKILLD_READ_APP_PRIVATE_KEY_PKCS8 is not a PKCS #8 PEM private key')
  return { _tag: 'app', app: { appId, installationId, privateKeyPkcs8 }, fallback }
}

/**
 * The GitHub credential a caller reads with: the read App's installation
 * token, or the fallback when the App gives none.
 *
 * When the App cannot give a token, the read still runs on the fallback and
 * the reason is reported, so a broken key shows up as an event instead of as
 * a spent quota.
 */
export function createGithubCredential(
  config: GithubCredentialConfig,
  runtime: GithubCredentialRuntime,
): GithubCredential {
  if (config._tag === 'anonymous')
    return { current: async () => ({ token: undefined, isApp: false }), fallback: null }
  if (config._tag === 'token')
    return { current: async () => ({ token: config.token.token, isApp: false }), fallback: null }
  const fallbackName = config.fallback?.name ?? 'anonymous'
  const fallback = { token: config.fallback?.token, isApp: false }
  if (config._tag === 'app-misconfigured') {
    return {
      current: async () => {
        runtime.report({ outcome: 'app-misconfigured', reason: config.reason, fallback: fallbackName })
        return fallback
      },
      fallback: null,
    }
  }
  const app = config.app
  const key = `${app.appId}:${app.installationId}`
  return {
    current: async () => {
      const cached = runtime.tokenCache.tokens.get(key)
      if (cached && cached.expiresAt - INSTALLATION_TOKEN_RENEW_SECONDS > runtime.now())
        return { token: cached.token, isApp: true }
      let pending = runtime.tokenCache.pending.get(key)
      if (!pending) {
        pending = mintInstallationToken(app, runtime).finally(() => runtime.tokenCache.pending.delete(key))
        runtime.tokenCache.pending.set(key, pending)
      }
      const minted = await pending
      if ('token' in minted) {
        runtime.tokenCache.tokens.set(key, minted)
        return { token: minted.token, isApp: true }
      }
      runtime.report({ outcome: 'app-token-unavailable', reason: minted.reason, fallback: fallbackName })
      return fallback
    },
    fallback: config.fallback,
  }
}

/**
 * Whether GitHub refused a read because it denies the App, as opposed to a
 * spent quota. Organizations that restrict Apps answer 403 with quota left,
 * and no rate limit message. `neondatabase` did on 2026-10-06.
 *
 * It reads the body of a 403, so pass a clone or a response whose body is
 * not needed.
 */
export async function githubDeniedApp(response: Response): Promise<boolean> {
  if (response.status !== 403)
    return false
  if (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.get('retry-after'))
    return false
  // A 403 body that will not read names no rate limit either, so it counts
  // as a denial. The status already says the read failed.
  const text = await response.text().catch(() => '')
  return !/rate limit/i.test(text)
}

const installationTokenSchema = z.object({
  token: z.string().min(1).max(2048),
  expires_at: z.string().datetime(),
}).passthrough()

export type InstallationTokenResult
  = | { _tag: 'created', token: string, expiresAt: string }
    /** GitHub answered 401, 403 or 404: the App, its key or the installation is gone. */
    | { _tag: 'refused', status: number }

/**
 * Exchange an App JWT for an installation access token.
 *
 * A refusal is a value. Any other failure, such as a 5xx or an unreadable
 * answer, throws: it says nothing about the App.
 */
export async function requestInstallationToken(input: {
  fetch: typeof globalThis.fetch
  jwt: string
  installationId: number
  body: { repository_ids?: number[], permissions: Record<string, 'read'> }
}): Promise<InstallationTokenResult> {
  const response = await input.fetch(`${GITHUB_API}/app/installations/${input.installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${input.jwt}`,
      'Content-Type': 'application/json',
      'User-Agent': 'skilld.dev',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    body: JSON.stringify(input.body),
    // workerd accepts only `follow` and `manual`. A redirect here is an error.
    redirect: 'manual',
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  })
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    throw new Error(`GitHub App request redirected ${response.status}`)
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    await response.body?.cancel()
    return { _tag: 'refused', status: response.status }
  }
  if (!response.ok)
    throw new Error(`GitHub App request returned ${response.status}`)
  const value = installationTokenSchema.safeParse(await readBoundedJson(response, MAX_TOKEN_RESPONSE_BYTES))
  if (!value.success)
    throw new Error('GitHub App returned an invalid response')
  return { _tag: 'created', token: value.data.token, expiresAt: value.data.expires_at }
}

/**
 * An RS256 GitHub App JWT. `issuer` is the App's client ID or its App ID;
 * GitHub accepts either.
 *
 * It is valid for ten minutes from a minute in the past, which absorbs clock
 * drift between the Worker and GitHub. Ten minutes is GitHub's maximum.
 */
export async function signGithubAppJwt(input: {
  issuer: string
  privateKeyPkcs8: Uint8Array
  /** Unix seconds. */
  now: number
}): Promise<string> {
  const issuedAt = input.now - 60
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    iat: issuedAt,
    exp: issuedAt + 600,
    iss: input.issuer,
  })))
  const unsigned = `${header}.${payload}`
  const imported = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(input.privateKeyPkcs8).buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    imported,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`
}

async function mintInstallationToken(
  app: ReadAppConfig,
  runtime: Pick<GithubCredentialRuntime, 'fetch' | 'now'>,
): Promise<CachedInstallationToken | { _tag: 'unavailable', reason: string }> {
  const minted = await signGithubAppJwt({ issuer: String(app.appId), privateKeyPkcs8: app.privateKeyPkcs8, now: runtime.now() })
    .then(jwt => requestInstallationToken({
      fetch: runtime.fetch,
      jwt,
      installationId: app.installationId,
      body: { permissions: { metadata: 'read' } },
    }))
    // A network fault, a 5xx or a key WebCrypto rejects: the read uses the
    // fallback token, and the reason reaches the report.
    .catch((error: unknown) => ({ _tag: 'failed' as const, reason: error instanceof Error ? error.message : String(error) }))
  if (minted._tag === 'failed')
    return { _tag: 'unavailable', reason: minted.reason.slice(0, 200) }
  if (minted._tag === 'refused')
    return { _tag: 'unavailable', reason: `GitHub refused the installation token (${minted.status})` }
  const expiresAt = Math.floor(Date.parse(minted.expiresAt) / 1000)
  return { token: minted.token, expiresAt }
}

function firstToken(env: GithubCredentialEnv, names: ReadonlyArray<FallbackToken['name']>): FallbackToken | null {
  for (const name of names) {
    const token = env[name]?.trim()
    if (token)
      return { name, token }
  }
  return null
}

function positiveInteger(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? ''
  if (!/^[1-9]\d*$/.test(trimmed))
    return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * The DER bytes of a PKCS #8 PEM private key, or null.
 *
 * A secret pasted through a dashboard or a JSON file can hold its line breaks
 * as the two characters `\n`, so both forms parse. A PKCS #1 key
 * (`BEGIN RSA PRIVATE KEY`, as GitHub downloads it) does not: WebCrypto
 * imports PKCS #8 only. Convert it with `openssl pkcs8 -topk8 -nocrypt`.
 */
function pkcs8PemBytes(value: string): Uint8Array | null {
  const text = value.replaceAll('\\n', '\n').trim()
  const match = /^-----BEGIN PRIVATE KEY-----([A-Z0-9+/=\s]+)-----END PRIVATE KEY-----$/i.exec(text)
  if (!match)
    return null
  const base64 = match[1]!.replace(/\s+/g, '')
  if (!/^[A-Z0-9+/]+={0,2}$/i.test(base64) || base64.length % 4 !== 0)
    return null
  const binary = atob(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new Error('GitHub App response exceeded the byte limit')
  if (!response.body)
    throw new Error('GitHub App returned an empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done)
      break
    size += next.value.byteLength
    if (size > maximumBytes) {
      await reader.cancel('response too large')
      throw new Error('GitHub App response exceeded the byte limit')
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
}
