import type { H3Event } from 'h3'

const ADMIN_EMAIL = 'harlan@harlanzw.com'

// Phase 1: bearer-token-only admin auth. Session-based admin returns in Phase 2
// once GitHub OAuth is wired up.
export async function requireAdmin(event: H3Event): Promise<{ email: string }> {
  const config = useRuntimeConfig(event)
  const auth = getHeader(event, 'authorization')
  if (config.adminSecret && auth === `Bearer ${config.adminSecret}`)
    return { email: ADMIN_EMAIL }

  throw createError({ statusCode: 403, message: 'Forbidden' })
}
