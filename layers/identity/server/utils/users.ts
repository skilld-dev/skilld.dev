import type { H3Event } from 'h3'
import { encryptToken } from './crypto'

export interface UserRow {
  id: number
  github_id: number
  login: string
  name: string | null
  email: string | null
  avatar: string | null
  digest_email: string | null
  email_opt_in: number
  digest_frequency: 'weekly' | 'daily' | 'off'
  digest_dow: number | null
  digest_hour: number
  timezone: string
  stars_synced_at: number | null
  onboarded_at: number | null
  last_login_at: number
}

export interface GitHubProfile {
  id: number
  login: string
  name?: string | null
  email?: string | null
  avatar_url?: string | null
}

function db(event: H3Event): D1Database {
  return event.context.platform.db
}

export async function upsertUserFromGithub(
  event: H3Event,
  profile: GitHubProfile,
  accessToken: string,
  scopes: string[],
): Promise<UserRow> {
  const config = useRuntimeConfig(event)
  const encrypted = await encryptToken(accessToken, config.tokenKey as string)
  const now = Math.floor(Date.now() / 1000)
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
       github_token_encrypted, github_token_scopes,
       created_at, last_login_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(github_id) DO UPDATE SET
       login = excluded.login,
       name = excluded.name,
       email = excluded.email,
       avatar = excluded.avatar,
       github_token_encrypted = excluded.github_token_encrypted,
       github_token_scopes = excluded.github_token_scopes,
       last_login_at = excluded.last_login_at`,
  ).bind(
    profile.id,
    profile.login,
    profile.name ?? null,
    profile.email ?? null,
    profile.avatar_url ?? null,
    encrypted,
    scopes.join(' '),
    now,
  ).run()

  const row = await d.prepare(
    `SELECT id, github_id, login, name, email, avatar,
            digest_email, email_opt_in, digest_frequency, digest_dow,
            digest_hour, timezone, stars_synced_at, onboarded_at, last_login_at
     FROM users WHERE github_id = ?1`,
  ).bind(profile.id).first<UserRow>()

  if (!row)
    throw createError({ statusCode: 500, message: 'User upsert failed' })
  return row
}

export async function getUserById(event: H3Event, id: number): Promise<UserRow | null> {
  const row = await db(event).prepare(
    `SELECT id, github_id, login, name, email, avatar,
            digest_email, email_opt_in, digest_frequency, digest_dow,
            digest_hour, timezone, stars_synced_at, onboarded_at, last_login_at
     FROM users WHERE id = ?1`,
  ).bind(id).first<UserRow>()
  return row ?? null
}

export async function requireUserRow(event: H3Event): Promise<UserRow> {
  // Cookie session (nuxt-auth-utils) OR bearer-resolved user populated by
  // `defineApiHandler` on `event.context.user`. Bearer path must be honored
  // here so the CLI can hit any `/me/*` endpoint that uses requireUserRow.
  const session = await getUserSession(event).catch(() => {
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
