import type { H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import { readUserSession } from '#shared/server/session-access'

const ADMIN_EMAIL = 'harlan@harlanzw.com'
// GitHub profiles can hide the email address, so the login is the stable
// admin identity; the email match only covers rows GitHub filled it in for.
const ADMIN_GITHUB_LOGIN = 'harlan-zw'

// Admin auth accepts either the bearer token (CLI, scripts) or a signed-in
// cookie session whose users row matches the admin identity.
export async function requireAdmin(event: H3Event): Promise<{ email: string }> {
  const config = useRuntimeConfig(event)
  const auth = getHeader(event, 'authorization')
  if (await isValidAdminAuthorization(auth, config.adminSecret))
    return { email: ADMIN_EMAIL }

  const session = await readUserSession(event).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'admin-session', outcome: 'failed' }))
    return null
  })
  const id = (session?.user as { id?: number } | undefined)?.id
  if (id) {
    const user = await getUserById(event, id)
    if (user && isAdminUser(user))
      return { email: user.email ?? ADMIN_EMAIL }
  }

  throw createError({ statusCode: 403, message: 'Forbidden' })
}

export function isAdminUser(user: { email: string | null, login: string }): boolean {
  return user.email === ADMIN_EMAIL || user.login === ADMIN_GITHUB_LOGIN
}

export async function isValidAdminAuthorization(authorization: string | undefined, secret: unknown): Promise<boolean> {
  if (!authorization?.startsWith('Bearer ') || typeof secret !== 'string' || !secret)
    return false

  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(authorization.slice(7))),
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ])
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash))
}
