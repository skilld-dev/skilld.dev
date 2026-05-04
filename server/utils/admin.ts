import type { H3Event } from 'h3'

const ADMIN_EMAIL = 'harlan@harlanzw.com'
const ADMIN_DID = 'did:plc:hvv3hamgocficqdvp5llrkha'
const ADMIN_HANDLE = 'harlanzw.com'

interface SessionData {
  public?: {
    did?: unknown
    handle?: unknown
    email?: unknown
  }
  user?: { email?: unknown }
  email?: unknown
}

export function getAdminEmailForAtprotoIdentity(input: { did?: string | null, handle?: string | null }): string | null {
  if (input.did === ADMIN_DID && input.handle === ADMIN_HANDLE)
    return ADMIN_EMAIL
  return null
}

function getSessionEmail(session: Awaited<ReturnType<typeof getUserSession>>): string | null {
  const data = session.data as SessionData | null

  const email = data?.public?.email ?? data?.user?.email ?? data?.email
  return typeof email === 'string' ? email.toLowerCase() : null
}

function getSessionAdminEmail(session: Awaited<ReturnType<typeof getUserSession>>): string | null {
  const email = getSessionEmail(session)
  if (email === ADMIN_EMAIL)
    return email

  const data = session.data as SessionData | null
  const did = typeof data?.public?.did === 'string' ? data.public.did : null
  const handle = typeof data?.public?.handle === 'string' ? data.public.handle : null
  return getAdminEmailForAtprotoIdentity({ did, handle })
}

export async function requireAdmin(event: H3Event): Promise<{ email: string }> {
  const config = useRuntimeConfig(event)
  const auth = getHeader(event, 'authorization')
  if (config.adminSecret && auth === `Bearer ${config.adminSecret}`)
    return { email: ADMIN_EMAIL }

  const session = await getUserSession(event)
  const email = getSessionAdminEmail(session)
  if (email)
    return { email }

  throw createError({ statusCode: 403, message: 'Forbidden' })
}
