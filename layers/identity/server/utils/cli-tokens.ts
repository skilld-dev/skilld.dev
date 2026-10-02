import type { H3Event } from 'h3'
import { decryptToken, encryptToken } from './crypto'

export type CliTokenKind = 'oauth' | 'pat' | 'oidc'

export interface IssueSessionOptions {
  kind: CliTokenKind
  scopes?: string
  deviceLabel?: string
  cliVersion?: string
  ttlSec?: number
  refresh?: boolean
}

export interface IssuedCliSession {
  /** The `cli_tokens` row. Revoking it ends the session. */
  tokenId: number
  accessToken: string
  refreshToken?: string
  expiresAt: number
  scopes: string
  userId: number
}

/**
 * Wire shape for token responses. The CLI rejects unknown fields, so never
 * spread `IssuedCliSession` into a response; map through this instead.
 */
export function presentTokenResponse(session: IssuedCliSession, login: string) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    scopes: session.scopes,
    login,
  }
}

interface CliTokenRow {
  id: number
  user_id: number
  refresh_hash: string
  refresh_token_encrypted: string | null
  prev_refresh_hash: string | null
  prev_refresh_expires_at: number | null
  kind: CliTokenKind
  scopes: string
  expires_at: number | null
  revoked_at: number | null
}

const ACCESS_TTL_SEC = 24 * 60 * 60
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60
const ROTATE_GRACE_SEC = 30

export async function issueSession(
  event: H3Event,
  userId: number,
  opts: IssueSessionOptions,
): Promise<IssuedCliSession> {
  const now = nowSec()
  const scopes = opts.scopes ?? 'cli'
  const accessExpiresAt = opts.kind === 'oauth'
    ? now + ACCESS_TTL_SEC
    : now + (opts.ttlSec ?? (opts.kind === 'oidc' ? 3600 : 10 * 365 * 24 * 60 * 60))
  const hasRefresh = opts.refresh ?? opts.kind === 'oauth'
  const refreshToken = hasRefresh ? randomBase64Url(32) : ''
  const refreshHash = hasRefresh ? await sha256Base64Url(refreshToken) : await sha256Base64Url(randomBase64Url(32))
  const refreshExpiresAt = opts.kind === 'pat'
    ? (opts.ttlSec ? now + opts.ttlSec : null)
    : opts.kind === 'oidc'
      ? accessExpiresAt
      : now + (opts.ttlSec ?? REFRESH_TTL_SEC)
  const encryptedRefresh = hasRefresh ? await encryptRefresh(event, refreshToken) : null

  await event.context.platform.db.prepare(
    `INSERT INTO cli_tokens (
       user_id, refresh_hash, refresh_token_encrypted, kind, scopes, device_label,
       cli_version, created_at, last_used_at, expires_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9)`,
  ).bind(
    userId,
    refreshHash,
    encryptedRefresh,
    opts.kind,
    scopes,
    opts.deviceLabel ?? null,
    opts.cliVersion ?? null,
    now,
    refreshExpiresAt,
  ).run()

  const row = await event.context.platform.db.prepare(
    `SELECT id FROM cli_tokens WHERE refresh_hash = ?1 AND revoked_at IS NULL`,
  ).bind(refreshHash).first<{ id: number }>()

  if (!row)
    throw createError({ statusCode: 500, message: 'CLI session issue failed' })

  return {
    tokenId: row.id,
    accessToken: await signAccessToken(event, row.id, userId, scopes, accessExpiresAt),
    refreshToken: hasRefresh ? refreshToken : undefined,
    expiresAt: accessExpiresAt,
    scopes,
    userId,
  }
}

/** A token a person creates by hand: no refresh token, and no set end unless `ttlDays` names one. */
export function issuePersonalToken(
  event: H3Event,
  userId: number,
  input: { label: string, ttlDays?: number },
): Promise<IssuedCliSession> {
  return issueSession(event, userId, {
    kind: 'pat',
    scopes: 'cli',
    deviceLabel: input.label,
    ttlSec: input.ttlDays ? input.ttlDays * 86400 : undefined,
    refresh: false,
  })
}

export async function rotateSession(event: H3Event, refreshToken: string): Promise<IssuedCliSession | null> {
  const now = nowSec()
  const hash = await sha256Base64Url(refreshToken)
  const db = event.context.platform.db

  const row = await db.prepare(
    `SELECT * FROM cli_tokens
     WHERE (refresh_hash = ?1 OR prev_refresh_hash = ?1)
       AND kind = 'oauth'
       AND revoked_at IS NULL
     LIMIT 1`,
  ).bind(hash).first<CliTokenRow>()

  if (!row)
    return null

  if (row.expires_at !== null && row.expires_at <= now)
    return null

  if (row.refresh_hash === hash) {
    const nextRefreshToken = randomBase64Url(32)
    const nextRefreshHash = await sha256Base64Url(nextRefreshToken)
    const accessExpiresAt = now + ACCESS_TTL_SEC
    const refreshExpiresAt = now + REFRESH_TTL_SEC

    await db.prepare(
      `UPDATE cli_tokens
       SET prev_refresh_hash = refresh_hash,
           prev_refresh_expires_at = ?1,
           refresh_hash = ?2,
           refresh_token_encrypted = ?3,
           last_used_at = ?4,
           expires_at = ?5
       WHERE id = ?6 AND revoked_at IS NULL`,
    ).bind(
      now + ROTATE_GRACE_SEC,
      nextRefreshHash,
      await encryptRefresh(event, nextRefreshToken),
      now,
      refreshExpiresAt,
      row.id,
    ).run()

    return {
      tokenId: row.id,
      accessToken: await signAccessToken(event, row.id, row.user_id, row.scopes, accessExpiresAt),
      refreshToken: nextRefreshToken,
      expiresAt: accessExpiresAt,
      scopes: row.scopes,
      userId: row.user_id,
    }
  }

  if (row.prev_refresh_hash === hash && row.prev_refresh_expires_at && row.prev_refresh_expires_at > now && row.refresh_token_encrypted) {
    const accessExpiresAt = now + ACCESS_TTL_SEC
    await db.prepare(
      `UPDATE cli_tokens SET last_used_at = ?1 WHERE id = ?2 AND revoked_at IS NULL`,
    ).bind(now, row.id).run()
    return {
      tokenId: row.id,
      accessToken: await signAccessToken(event, row.id, row.user_id, row.scopes, accessExpiresAt),
      refreshToken: await decryptRefresh(event, row.refresh_token_encrypted),
      expiresAt: accessExpiresAt,
      scopes: row.scopes,
      userId: row.user_id,
    }
  }

  return null
}

export async function revokeSession(event: H3Event, refreshTokenOrTokenId: string | number): Promise<void> {
  const now = nowSec()
  if (typeof refreshTokenOrTokenId === 'number') {
    await event.context.platform.db.prepare(
      `UPDATE cli_tokens SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL`,
    ).bind(now, refreshTokenOrTokenId).run()
    return
  }

  const hash = await sha256Base64Url(refreshTokenOrTokenId)
  await event.context.platform.db.prepare(
    `UPDATE cli_tokens SET revoked_at = ?1
     WHERE (refresh_hash = ?2 OR prev_refresh_hash = ?2) AND revoked_at IS NULL`,
  ).bind(now, hash).run()
}

/** One `cli_tokens` row as the dashboard and the public API list it. Never the hashes. */
export interface CliTokenListRow {
  id: number
  kind: CliTokenKind
  device_label: string | null
  cli_version: string | null
  scopes: string
  created_at: number
  last_used_at: number
  expires_at: number | null
  revoked_at: number | null
}

/** Every token of one account, revoked ones last, then most recently used first. */
export async function loadCliTokens(db: D1Database, userId: number): Promise<CliTokenListRow[]> {
  const res = await db.prepare(
    `SELECT id, kind, device_label, cli_version, scopes, created_at, last_used_at, expires_at, revoked_at
     FROM cli_tokens
     WHERE user_id = ?1
     ORDER BY revoked_at IS NOT NULL ASC, last_used_at DESC`,
  ).bind(userId).all<CliTokenListRow>()
  return res.results ?? []
}

/** The kind of one token of one account, or null when the account holds no such token. */
export async function loadCliTokenKind(db: D1Database, userId: number, tokenId: number): Promise<CliTokenKind | null> {
  const row = await db.prepare(`SELECT kind FROM cli_tokens WHERE id = ?1 AND user_id = ?2`)
    .bind(tokenId, userId)
    .first<{ kind: CliTokenKind }>()
  return row?.kind ?? null
}

/**
 * Revoke one token of one account.
 *
 * Answers whether the account owns the token, so a caller can tell another
 * account's token from its own. A token revoked earlier keeps its first
 * revocation time, so sending this twice changes nothing.
 */
export async function revokeCliToken(db: D1Database, userId: number, tokenId: number): Promise<'revoked' | 'not_found'> {
  const row = await db.prepare(
    `UPDATE cli_tokens SET revoked_at = COALESCE(revoked_at, ?1)
     WHERE id = ?2 AND user_id = ?3
     RETURNING id`,
  ).bind(nowSec(), tokenId, userId).first<{ id: number }>()
  return row ? 'revoked' : 'not_found'
}

export async function verifyAccessToken(event: H3Event, jwt: string): Promise<{ tokenId: number, userId: number, scopes: string } | null> {
  const payload = await verifyJwt(event, jwt)
  if (!payload)
    return null

  const now = nowSec()
  if (payload.exp <= now)
    return null

  const row = await event.context.platform.db.prepare(
    `SELECT id, user_id, scopes, expires_at, revoked_at
     FROM cli_tokens
     WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
  ).bind(payload.tid, payload.sub).first<Pick<CliTokenRow, 'id' | 'user_id' | 'scopes' | 'expires_at' | 'revoked_at'>>()

  if (!row)
    return null
  if (row.expires_at !== null && row.expires_at <= now)
    return null

  await event.context.platform.db.prepare(
    `UPDATE cli_tokens SET last_used_at = ?1 WHERE id = ?2`,
  ).bind(now, row.id).run()

  return { tokenId: row.id, userId: row.user_id, scopes: row.scopes }
}

async function signAccessToken(event: H3Event, tokenId: number, userId: number, scopes: string, expiresAt: number): Promise<string> {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' })
  const payload = base64UrlJson({ sub: userId, tid: tokenId, scopes, exp: expiresAt, iat: nowSec() })
  const sig = await hmacSha256Base64Url(signingKey(event), `${header}.${payload}`)
  return `${header}.${payload}.${sig}`
}

async function verifyJwt(event: H3Event, jwt: string): Promise<{ sub: number, tid: number, scopes: string, exp: number } | null> {
  const parts = jwt.split('.')
  if (parts.length !== 3)
    return null

  const expected = await hmacSha256Base64Url(signingKey(event), `${parts[0]}.${parts[1]}`)
  if (!timingSafeEqual(expected, parts[2]!))
    return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]!))) as {
      sub?: unknown
      tid?: unknown
      scopes?: unknown
      exp?: unknown
    }
    if (typeof payload.sub !== 'number' || typeof payload.tid !== 'number' || typeof payload.scopes !== 'string' || typeof payload.exp !== 'number')
      return null
    return { sub: payload.sub, tid: payload.tid, scopes: payload.scopes, exp: payload.exp }
  }
  catch {
    return null
  }
}

function signingKey(event: H3Event): Uint8Array {
  const key = tokenKey(event)
  if (!key)
    throw createError({ statusCode: 500, message: 'NUXT_TOKEN_KEY missing' })
  return base64UrlDecode(key.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''))
}

async function encryptRefresh(event: H3Event, token: string): Promise<string> {
  return encryptToken(token, tokenKey(event))
}

async function decryptRefresh(event: H3Event, ciphertext: string): Promise<string> {
  return decryptToken(ciphertext, tokenKey(event))
}

function tokenKey(event: H3Event): string {
  return (useRuntimeConfig(event).tokenKey as string) || process.env.NUXT_TOKEN_KEY || ''
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64UrlEncode(new Uint8Array(digest))
}

function hmacSha256Base64Url(keyBytes: Uint8Array, value: string): Promise<string> {
  const keyBuffer = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer
  const valueBuffer = new TextEncoder().encode(value).buffer as ArrayBuffer
  return crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, valueBuffer))
    .then(sig => base64UrlEncode(new Uint8Array(sig)))
}

export function randomBase64Url(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return base64UrlEncode(buf)
}

function base64UrlJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)))
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const b64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length)
    return false
  let out = 0
  for (let i = 0; i < a.length; i++)
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}
