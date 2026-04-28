import type { H3Event } from 'h3'

const ADMIN_HANDLE = 'harlanzw.com'

export async function requireAdmin(event: H3Event): Promise<{ handle: string }> {
  const config = useRuntimeConfig(event)
  const auth = getHeader(event, 'authorization')
  if (config.adminSecret && auth === `Bearer ${config.adminSecret}`)
    return { handle: 'system' }

  const session = await getUserSession(event)
  const handle = session.data?.public?.handle
  if (handle === ADMIN_HANDLE)
    return { handle }

  throw createError({ statusCode: 403, message: 'Forbidden' })
}
