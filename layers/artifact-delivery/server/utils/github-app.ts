import { z } from 'zod'
import { decryptToken } from '#layers/identity/server/utils/crypto'
import { base64ToBytes, bytesToBase64Url } from './encoding'

const GITHUB_API = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'
const GITHUB_REQUEST_TIMEOUT_MS = 15_000
const MAX_GITHUB_APP_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_INSTALLATIONS = 500
const MAX_REPOSITORIES = 500

const installationSchema = z.object({
  id: z.number().int().positive().safe(),
  app_id: z.number().int().positive().safe(),
  account: z.object({ id: z.number().int().positive().safe() }).passthrough(),
  repository_selection: z.enum(['all', 'selected']),
  suspended_at: z.string().nullable().optional(),
}).passthrough()

const installationsSchema = z.object({
  total_count: z.number().int().nonnegative(),
  installations: z.array(installationSchema).max(100),
}).passthrough()

const repositorySchema = z.object({
  id: z.number().int().positive().safe(),
  name: z.string().min(1).max(100),
  private: z.boolean(),
  owner: z.object({
    id: z.number().int().positive().safe(),
    login: z.string().min(1).max(100),
  }).passthrough(),
}).passthrough()

const repositoriesSchema = z.object({
  total_count: z.number().int().nonnegative(),
  repositories: z.array(repositorySchema).max(100),
}).passthrough()

const installationTokenSchema = z.object({
  token: z.string().min(1).max(2048),
  expires_at: z.string().datetime(),
}).passthrough()

export interface GithubAppConfig {
  appId: number
  clientId: string
  privateKeyPkcs8: string
  fetch: typeof globalThis.fetch
  now: () => number
}

export interface GithubSelectedRepository {
  id: number
  name: string
  private: true
  owner: { id: number, login: string }
}

export type GithubInstallationSelectionResult
  = {
    _tag: 'selected'
    installationId: number
    githubAccountId: number
    repositories: GithubSelectedRepository[]
  }
  | { _tag: 'not-found' }

export interface GithubAppClient {
  selectedRepositoriesForUser: (
    userToken: string,
    installationId: number,
  ) => Promise<GithubInstallationSelectionResult>
  createRepositoryToken: (
    installationId: number,
    repositoryId: number,
  ) => Promise<{ _tag: 'created', token: string, expiresAt: string } | { _tag: 'not-found' }>
  userCanAccessRepository: (
    userToken: string,
    installationId: number,
    repositoryId: number,
  ) => Promise<boolean>
}

export function createGithubAppClientFromEnv(
  env: Cloudflare.Env,
  fetcher: typeof globalThis.fetch = fetch,
  now: () => number = () => Math.floor(Date.now() / 1000),
): GithubAppClient {
  const appId = Number(env.GITHUB_APP_ID)
  if (!Number.isSafeInteger(appId) || appId <= 0)
    throw new Error('GitHub App ID is invalid')
  return createGithubAppClient({
    appId,
    clientId: env.GITHUB_APP_CLIENT_ID,
    privateKeyPkcs8: env.GITHUB_APP_PRIVATE_KEY_PKCS8,
    fetch: fetcher,
    now,
  })
}

export async function loadAccountGithubUserToken(
  db: D1Database,
  accountId: number,
  tokenKey: string,
): Promise<string | null> {
  const row = await db.prepare(
    `SELECT github_token_encrypted
     FROM users
     WHERE id = ?1
     LIMIT 1`,
  ).bind(accountId).first<{ github_token_encrypted: string | null }>()
  if (!row?.github_token_encrypted)
    return null
  return await decryptToken(row.github_token_encrypted, tokenKey)
}

export function createGithubAppClient(config: GithubAppConfig): GithubAppClient {
  const request = async <T>(
    path: string,
    token: string,
    schema: z.ZodType<T>,
    init: { method?: 'GET' | 'POST', body?: unknown } = {},
  ): Promise<{ _tag: 'ok', value: T } | { _tag: 'not-found' }> => {
    const response = await config.fetch(`${GITHUB_API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'skilld.dev',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'error',
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    })
    if (response.status === 401 || response.status === 403 || response.status === 404)
      return { _tag: 'not-found' }
    if (!response.ok)
      throw new Error(`GitHub App request returned ${response.status}`)
    const value = schema.safeParse(await readBoundedJson(response, MAX_GITHUB_APP_RESPONSE_BYTES))
    if (!value.success)
      throw new Error('GitHub App returned an invalid response')
    return { _tag: 'ok', value: value.data }
  }

  const listUserInstallations = async (userToken: string) => {
    const installations: Array<z.infer<typeof installationSchema>> = []
    for (let page = 1; page <= 5; page++) {
      const result = await request(
        `/user/installations?per_page=100&page=${page}`,
        userToken,
        installationsSchema,
      )
      if (result._tag === 'not-found')
        return null
      installations.push(...result.value.installations)
      if (installations.length > MAX_INSTALLATIONS)
        throw new Error('GitHub App installation list exceeded the item limit')
      if (installations.length >= result.value.total_count || result.value.installations.length < 100)
        break
    }
    return installations
  }

  const listUserRepositories = async (userToken: string, installationId: number) => {
    const repositories: Array<z.infer<typeof repositorySchema>> = []
    for (let page = 1; page <= 5; page++) {
      const result = await request(
        `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
        userToken,
        repositoriesSchema,
      )
      if (result._tag === 'not-found')
        return null
      repositories.push(...result.value.repositories)
      if (repositories.length > MAX_REPOSITORIES)
        throw new Error('GitHub App Repository list exceeded the item limit')
      if (repositories.length >= result.value.total_count || result.value.repositories.length < 100)
        break
    }
    return repositories
  }

  return {
    async selectedRepositoriesForUser(userToken, installationId) {
      const installations = await listUserInstallations(userToken)
      const installation = installations?.find(candidate => candidate.id === installationId)
      if (
        !installation
        || installation.app_id !== config.appId
        || installation.repository_selection !== 'selected'
        || installation.suspended_at
      ) {
        return { _tag: 'not-found' }
      }
      const repositories = await listUserRepositories(userToken, installationId)
      if (!repositories)
        return { _tag: 'not-found' }
      return {
        _tag: 'selected',
        installationId,
        githubAccountId: installation.account.id,
        repositories: repositories
          .filter((repository): repository is typeof repository & { private: true } => repository.private)
          .map(repository => ({
            id: repository.id,
            name: repository.name,
            private: true,
            owner: { id: repository.owner.id, login: repository.owner.login },
          })),
      }
    },

    async createRepositoryToken(installationId, repositoryId) {
      const jwt = await createGithubAppJwt(config)
      const result = await request(
        `/app/installations/${installationId}/access_tokens`,
        jwt,
        installationTokenSchema,
        {
          method: 'POST',
          body: {
            repository_ids: [repositoryId],
            permissions: { contents: 'read', metadata: 'read' },
          },
        },
      )
      return result._tag === 'ok'
        ? { _tag: 'created', token: result.value.token, expiresAt: result.value.expires_at }
        : result
    },

    async userCanAccessRepository(userToken, installationId, repositoryId) {
      const installations = await listUserInstallations(userToken)
      const installation = installations?.find(candidate => candidate.id === installationId)
      if (!installation || installation.app_id !== config.appId || installation.suspended_at)
        return false
      const repositories = await listUserRepositories(userToken, installationId)
      return repositories?.some(repository => repository.id === repositoryId && repository.private) ?? false
    },
  }
}

export async function verifyGithubWebhookSignature(
  secret: string,
  body: Uint8Array,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!secret || !signatureHeader?.startsWith('sha256='))
    return false
  const expectedHex = signatureHeader.slice('sha256='.length)
  if (!/^[a-f0-9]{64}$/.test(expectedHex))
    return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const actual = new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(body)))
  const expected = Uint8Array.from(expectedHex.match(/.{2}/g) ?? [], value => Number.parseInt(value, 16))
  if (actual.byteLength !== expected.byteLength)
    return false
  let different = 0
  for (let index = 0; index < actual.byteLength; index++)
    different |= actual[index]! ^ expected[index]!
  return different === 0
}

async function createGithubAppJwt(config: GithubAppConfig): Promise<string> {
  const privateKey = decodeCanonicalBase64Url(config.privateKeyPkcs8)
  if (!privateKey)
    throw new Error('GitHub App private key is malformed')
  const issuedAt = config.now() - 60
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    iat: issuedAt,
    exp: issuedAt + 600,
    iss: config.clientId,
  })))
  const unsigned = `${header}.${payload}`
  const imported = await crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    imported,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`
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

function decodeCanonicalBase64Url(value: string): Uint8Array | null {
  try {
    const bytes = base64ToBytes(value)
    return bytesToBase64Url(bytes) === value ? bytes : null
  }
  catch {
    return null
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}
