import type { LoadSourceResult, PublicGithubSourceClient, ResolveSourceResult } from './github-source'
import { requestInstallationToken, signGithubAppJwt } from './github-app'

/**
 * Renew an installation token this long before GitHub says it expires, so a
 * build that starts with it never sees it lapse part way through.
 */
export const INSTALLATION_TOKEN_RENEW_SECONDS = 5 * 60

/** The read App: metadata read only, installed on skilld-dev. */
export interface ReadAppConfig {
  appId: number
  installationId: number
  privateKeyPkcs8: Uint8Array
}

/** The token a build reads with when the App gives none, by its secret name. */
export interface FallbackToken {
  name: 'ARTIFACT_GITHUB_TOKEN' | 'GITHUB_TOKEN'
  token: string
}

/**
 * Where public Artifact builds get their GitHub credential, parsed once from
 * the Worker env.
 *
 * GitHub counts a personal token's quota per account, so every token of one
 * account shares one bucket. An App installation has a bucket of its own.
 */
export type ArtifactGithubCredentialConfig
  = | { _tag: 'app', app: ReadAppConfig, fallback: FallbackToken | null }
    /** App secrets are set but unusable. Builds read with the fallback and report why. */
    | { _tag: 'app-misconfigured', reason: string, fallback: FallbackToken | null }
    | { _tag: 'token', token: FallbackToken }
    | { _tag: 'anonymous' }

export interface ArtifactGithubCredentialEnv {
  SKILLD_READ_APP_ID?: string
  SKILLD_READ_APP_INSTALLATION_ID?: string
  SKILLD_READ_APP_PRIVATE_KEY_PKCS8?: string
  ARTIFACT_GITHUB_TOKEN?: string
  GITHUB_TOKEN?: string
}

/** Why a build read with a fallback token. It names secrets, never a value. */
export interface ArtifactGithubCredentialReport {
  outcome: 'app-misconfigured' | 'app-token-unavailable' | 'app-denied'
  reason: string
  fallback: FallbackToken['name'] | 'anonymous'
}

interface CachedInstallationToken {
  token: string
  /** Unix seconds. */
  expiresAt: number
}

/**
 * Installation tokens kept between builds in one isolate. A token lives an
 * hour; minting one per build would add a request and a signature to each.
 */
export interface InstallationTokenCache {
  tokens: Map<string, CachedInstallationToken>
  pending: Map<string, Promise<CachedInstallationToken | { _tag: 'unavailable', reason: string }>>
}

export function createInstallationTokenCache(): InstallationTokenCache {
  return { tokens: new Map(), pending: new Map() }
}

export interface ArtifactGithubCredentialRuntime {
  fetch: typeof globalThis.fetch
  /** Unix seconds. */
  now: () => number
  tokenCache: InstallationTokenCache
  report: (event: ArtifactGithubCredentialReport) => void
}

/** The credential for one GitHub read. An undefined token reads anonymously. */
export interface GithubReadCredential {
  token: string | undefined
  /** The read App's installation token, which a Repository can deny. */
  isApp: boolean
}

export interface ArtifactGithubCredential {
  current: () => Promise<GithubReadCredential>
  /** The token after the read App, or null. */
  fallback: FallbackToken | null
}

export function parseArtifactGithubCredentialConfig(env: ArtifactGithubCredentialEnv): ArtifactGithubCredentialConfig {
  const fallback = fallbackToken(env)
  const appSecrets = [env.SKILLD_READ_APP_ID, env.SKILLD_READ_APP_INSTALLATION_ID, env.SKILLD_READ_APP_PRIVATE_KEY_PKCS8]
  if (appSecrets.every(value => !value?.trim()))
    return fallback ? { _tag: 'token', token: fallback } : { _tag: 'anonymous' }
  const misconfigured = (reason: string): ArtifactGithubCredentialConfig => ({ _tag: 'app-misconfigured', reason, fallback })
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
 * The GitHub credential public Artifact builds read with: the read App's
 * installation token, then `ARTIFACT_GITHUB_TOKEN`, then `GITHUB_TOKEN`.
 *
 * The registry sync and `/gh` page views keep `GITHUB_TOKEN`. When the App
 * cannot give a token, the build still runs on the fallback and the reason is
 * reported, so a broken key shows up as an event instead of as a spent quota.
 */
export function createArtifactGithubCredential(
  config: ArtifactGithubCredentialConfig,
  runtime: ArtifactGithubCredentialRuntime,
): ArtifactGithubCredential {
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
 * A GitHub source client whose every read asks for the current credential, so
 * a long-lived client never reads with an expired installation token.
 *
 * Some organizations deny the read App on a public Repository that a personal
 * token reads: `neondatabase/agent-skills` answered SOURCE_ACCESS_DENIED to
 * every run on 2026-10-06. A read the App was denied repeats once with the
 * fallback token, and the denial is reported.
 */
export function withGithubCredential(
  credential: ArtifactGithubCredential,
  create: (token: string | undefined) => PublicGithubSourceClient,
  report: (event: ArtifactGithubCredentialReport) => void,
): PublicGithubSourceClient {
  const read = async <T extends ResolveSourceResult | LoadSourceResult>(
    repository: { owner: string, repository: string },
    run: (client: PublicGithubSourceClient) => Promise<T>,
  ): Promise<T> => {
    const current = await credential.current()
    const first = await run(create(current.token))
    const fallback = credential.fallback
    if (!current.isApp || !fallback || first._tag !== 'rejected' || first.code !== 'SOURCE_ACCESS_DENIED')
      return first
    report({
      outcome: 'app-denied',
      reason: `GitHub denied the read App for ${repository.owner}/${repository.repository}`,
      fallback: fallback.name,
    })
    return await run(create(fallback.token))
  }
  return {
    resolve: async request => await read(request, client => client.resolve(request)),
    load: async source => await read(source, client => client.load(source)),
  }
}

async function mintInstallationToken(
  app: ReadAppConfig,
  runtime: Pick<ArtifactGithubCredentialRuntime, 'fetch' | 'now'>,
): Promise<CachedInstallationToken | { _tag: 'unavailable', reason: string }> {
  const minted = await signGithubAppJwt({ issuer: String(app.appId), privateKeyPkcs8: app.privateKeyPkcs8, now: runtime.now() })
    .then(jwt => requestInstallationToken({
      fetch: runtime.fetch,
      jwt,
      installationId: app.installationId,
      body: { permissions: { metadata: 'read' } },
    }))
    // A network fault, a 5xx or a key WebCrypto rejects: the build reads with
    // the fallback token, and the reason reaches the report.
    .catch((error: unknown) => ({ _tag: 'failed' as const, reason: error instanceof Error ? error.message : String(error) }))
  if (minted._tag === 'failed')
    return { _tag: 'unavailable', reason: minted.reason.slice(0, 200) }
  if (minted._tag === 'refused')
    return { _tag: 'unavailable', reason: `GitHub refused the installation token (${minted.status})` }
  const expiresAt = Math.floor(Date.parse(minted.expiresAt) / 1000)
  return { token: minted.token, expiresAt }
}

function fallbackToken(env: ArtifactGithubCredentialEnv): FallbackToken | null {
  if (env.ARTIFACT_GITHUB_TOKEN?.trim())
    return { name: 'ARTIFACT_GITHUB_TOKEN', token: env.ARTIFACT_GITHUB_TOKEN.trim() }
  if (env.GITHUB_TOKEN?.trim())
    return { name: 'GITHUB_TOKEN', token: env.GITHUB_TOKEN.trim() }
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
