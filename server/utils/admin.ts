import type { H3Event } from 'h3'

const ADMIN_EMAIL = 'harlan@harlanzw.com'

function getSessionEmail(session: Awaited<ReturnType<typeof getUserSession>>): string | null {
  const data = session.data as {
    public?: { email?: unknown }
    user?: { email?: unknown }
    email?: unknown
  } | null

  const email = data?.public?.email ?? data?.user?.email ?? data?.email
  return typeof email === 'string' ? email.toLowerCase() : null
}

export async function requireAdmin(event: H3Event): Promise<{ email: string }> {
  const config = useRuntimeConfig(event)
  const auth = getHeader(event, 'authorization')
  if (config.adminSecret && auth === `Bearer ${config.adminSecret}`)
    return { email: ADMIN_EMAIL }

  const session = await getUserSession(event)
  const email = getSessionEmail(session)
  if (email === ADMIN_EMAIL)
    return { email }

  throw createError({ statusCode: 403, message: 'Forbidden' })
}
