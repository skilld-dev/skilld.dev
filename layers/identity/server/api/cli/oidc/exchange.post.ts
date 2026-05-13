import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { issueSession } from '../../../utils/cli-tokens'

const ExchangeInput = z.object({
  id_token: z.string().min(64),
})

interface GitHubOidcClaims {
  aud: string | string[]
  exp: number
  repository: string
  repository_owner: string
  ref?: string
  workflow?: string
}

interface Jwk {
  kid: string
  kty: string
  alg: string
  use: string
  n: string
  e: string
}

let cachedJwks: { expiresAt: number, keys: Jwk[] } | null = null

export default defineApiHandler({
  schema: ExchangeInput,
  handler: async ({ event, body }) => {
    const claims = await verifyGitHubOidc(body.id_token)
    if (!claims)
      throw createError({ statusCode: 401, message: 'Invalid GitHub Actions OIDC token' })

    const owner = claims.repository_owner
    const user = await event.context.platform.db.prepare(
      `SELECT id, login FROM users WHERE lower(login) = lower(?1) LIMIT 1`,
    ).bind(owner).first<{ id: number, login: string }>()

    if (!user) {
      throw createError({
        statusCode: 403,
        message: 'log in to skilld.dev with this repo\'s owner account first.',
      })
    }

    const session = await issueSession(event, user.id, {
      kind: 'oidc',
      scopes: 'cli',
      ttlSec: 3600,
      deviceLabel: claims.repository,
      refresh: false,
    })

    return {
      ...session,
      login: user.login,
      repository: claims.repository,
      ref: claims.ref,
      workflow: claims.workflow,
    }
  },
})

async function verifyGitHubOidc(jwt: string): Promise<GitHubOidcClaims | null> {
  const [rawHeader, rawPayload, rawSignature] = jwt.split('.')
  if (!rawHeader || !rawPayload || !rawSignature)
    return null

  const header = parsePart<{ alg?: string, kid?: string }>(rawHeader)
  if (header?.alg !== 'RS256' || !header.kid)
    return null

  const key = (await getJwks()).find(k => k.kid === header.kid && k.kty === 'RSA')
  if (!key)
    return null

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const data = toArrayBuffer(new TextEncoder().encode(`${rawHeader}.${rawPayload}`))
  const signature = toArrayBuffer(base64UrlDecode(rawSignature))
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, data)
  if (!valid)
    return null

  const claims = parsePart<GitHubOidcClaims>(rawPayload)
  if (!claims)
    return null
  if (!audMatches(claims.aud) || claims.exp <= Math.floor(Date.now() / 1000))
    return null
  if (!claims.repository || !claims.repository_owner)
    return null

  return claims
}

async function getJwks(): Promise<Jwk[]> {
  const now = Date.now()
  if (cachedJwks && cachedJwks.expiresAt > now)
    return cachedJwks.keys

  const config = await fetch('https://token.actions.githubusercontent.com/.well-known/openid-configuration').then(r => r.json()) as { jwks_uri?: string }
  if (!config.jwks_uri)
    throw createError({ statusCode: 502, message: 'GitHub OIDC configuration missing jwks_uri' })

  const jwks = await fetch(config.jwks_uri).then(r => r.json()) as { keys?: Jwk[] }
  cachedJwks = { expiresAt: now + 24 * 60 * 60 * 1000, keys: jwks.keys ?? [] }
  return cachedJwks.keys
}

function audMatches(aud: string | string[]): boolean {
  return Array.isArray(aud) ? aud.includes('skilld.dev') : aud === 'skilld.dev'
}

function parsePart<T>(part: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T
  }
  catch {
    return null
  }
}

function base64UrlDecode(value: string): Uint8Array {
  const b64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
