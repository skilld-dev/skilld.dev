import type { H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'

const ADMIN_EMAIL = 'harlan@harlanzw.com'

// Phase 1: bearer-token-only admin auth. Session-based admin returns in Phase 2
// once GitHub OAuth is wired up.
export async function requireAdmin(event: H3Event): Promise<{ email: string }> {
  const config = useRuntimeConfig(event)
  const auth = getHeader(event, 'authorization')
  if (await isValidAdminAuthorization(auth, config.adminSecret))
    return { email: ADMIN_EMAIL }

  throw createError({ statusCode: 403, message: 'Forbidden' })
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
