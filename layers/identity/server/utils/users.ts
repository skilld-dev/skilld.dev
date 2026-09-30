import type { H3Event } from 'h3'
import { readUserSession } from '#shared/server/session-access'
import { decryptToken, encryptToken } from './crypto'

export interface UserRow {
  id: number
  github_id: number
  login: string
  name: string | null
  email: string | null
  avatar: string | null
  digest_email: string | null
  email_opt_in: number
  weekly_opt_out: number
  timezone: string
  stars_synced_at: number | null
  onboarded_at: number | null
  last_login_at: number
  /** 1 when anyone can read /@login/liked. 0 keeps it to the owner. */
  likes_public: number
  /** 1 when sign-in may scan the account's public repositories for Skills. */
  repo_indexing: number
}

export interface GitHubProfile {
  id: number
  login: string
  name?: string | null
  email?: string | null
  avatar_url?: string | null
}

export interface GithubUserCredentials {
  accessToken: string
  accessTokenExpiresIn: number | null
  refreshToken: string | null
  refreshTokenExpiresIn: number | null
  clientId: string
  scopes: string[]
}

function db(event: H3Event): D1Database {
  return event.context.platform.db
}

export async function upsertUserFromGithub(
  event: H3Event,
  profile: GitHubProfile,
  credentials: GithubUserCredentials,
): Promise<UserRow> {
  const config = useRuntimeConfig(event)
  const encrypted = await encryptToken(credentials.accessToken, config.tokenKey as string)
  const encryptedRefreshToken = credentials.refreshToken
    ? await encryptToken(credentials.refreshToken, config.tokenKey as string)
    : null
  const now = Math.floor(Date.now() / 1000)
  const accessTokenExpiresAt = credentials.accessTokenExpiresIn === null
    ? null
    : now + credentials.accessTokenExpiresIn
  const refreshTokenExpiresAt = credentials.refreshTokenExpiresIn === null
    ? null
    : now + credentials.refreshTokenExpiresIn
  const d = db(event)

  // Merge ghost rows seeded by 0022 backfill (github_id < 0, login matches).
  await d.prepare(
    `UPDATE users
     SET github_id = ?1
     WHERE github_id < 0 AND login = ?2`,
  ).bind(profile.id, profile.login).run()

  await d.prepare(
    `INSERT INTO users (
       github_id, login, name, email, avatar,
       github_token_encrypted, github_token_scopes, github_token_expires_at,
       github_refresh_token_encrypted, github_refresh_token_expires_at,
       github_token_client_id,
       created_at, last_login_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
     ON CONFLICT(github_id) DO UPDATE SET
       login = excluded.login,
       name = excluded.name,
       -- A private profile or a failed /user/emails lookup yields no address;
       -- that must not erase the one an earlier sign-in stored.
       email = COALESCE(excluded.email, users.email),
       avatar = excluded.avatar,
       github_token_encrypted = excluded.github_token_encrypted,
       github_token_scopes = excluded.github_token_scopes,
       github_token_expires_at = excluded.github_token_expires_at,
       github_refresh_token_encrypted = excluded.github_refresh_token_encrypted,
       github_refresh_token_expires_at = excluded.github_refresh_token_expires_at,
       github_token_client_id = excluded.github_token_client_id,
       last_login_at = excluded.last_login_at`,
  ).bind(
    profile.id,
    profile.login,
    profile.name ?? null,
    profile.email ?? null,
    profile.avatar_url ?? null,
    encrypted,
    credentials.scopes.join(' '),
    accessTokenExpiresAt,
    encryptedRefreshToken,
    refreshTokenExpiresAt,
    credentials.clientId,
    now,
  ).run()

  const row = await d.prepare(
    `SELECT id, github_id, login, name, email, avatar,
            digest_email, email_opt_in, weekly_opt_out, timezone,
            stars_synced_at, onboarded_at, last_login_at, likes_public, repo_indexing
     FROM users WHERE github_id = ?1`,
  ).bind(profile.id).first<UserRow>()

  if (!row)
    throw createError({ statusCode: 500, message: 'User upsert failed' })
  return row
}

export async function getUserById(event: H3Event, id: number): Promise<UserRow | null> {
  const row = await db(event).prepare(
    `SELECT id, github_id, login, name, email, avatar,
            digest_email, email_opt_in, weekly_opt_out, timezone,
            stars_synced_at, onboarded_at, last_login_at, likes_public, repo_indexing
     FROM users WHERE id = ?1`,
  ).bind(id).first<UserRow>()
  return row ?? null
}

export async function requireUserRow(event: H3Event): Promise<UserRow> {
  // Cookie session (nuxt-auth-utils) OR bearer-resolved user populated by
  // `defineApiHandler` on `event.context.user`. Bearer path must be honored
  // here so the CLI can hit any `/me/*` endpoint that uses requireUserRow.
  const session = await readUserSession(event).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'user-session', outcome: 'failed' }))
    return null
  })
  const ctxUser = event.context.user as { id?: number } | undefined
  const id = (session?.user as { id?: number } | undefined)?.id ?? ctxUser?.id
  if (!id)
    throw createError({ statusCode: 401, message: 'Not signed in' })
  const user = await getUserById(event, id)
  if (!user)
    throw createError({ statusCode: 401, message: 'User not found' })
  return user
}

const GITHUB_SIGN_IN_REQUIRED = 'Your GitHub access ended when you signed out. Sign in with GitHub again.'

/**
 * Delete the GitHub OAuth tokens stored for one account.
 *
 * Sign-out calls this, so a closed session leaves no usable GitHub credential
 * behind. The next GitHub sign-in stores new tokens.
 */
export async function clearGithubUserCredentials(db: D1Database, userId: number): Promise<void> {
  await db.prepare(
    `UPDATE users
     SET github_token_encrypted = NULL,
         github_token_scopes = NULL,
         github_token_expires_at = NULL,
         github_refresh_token_encrypted = NULL,
         github_refresh_token_expires_at = NULL,
         github_token_client_id = NULL
     WHERE id = ?1`,
  ).bind(userId).run()
}

/**
 * Read the stored GitHub access token, or ask for a new GitHub sign-in.
 *
 * The token is absent after sign-out, so another open session must not fail
 * with a generic error.
 */
export async function requireGithubUserToken(
  db: D1Database,
  userId: number,
  tokenKey: string,
): Promise<string> {
  const row = await db.prepare(
    `SELECT github_token_encrypted FROM users WHERE id = ?1`,
  ).bind(userId).first<{ github_token_encrypted: string | null }>()
  if (!row?.github_token_encrypted)
    throw createError({ statusCode: 401, statusMessage: 'GitHub sign-in required', message: GITHUB_SIGN_IN_REQUIRED })
  return await decryptToken(row.github_token_encrypted, tokenKey)
}
