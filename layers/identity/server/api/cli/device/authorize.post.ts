import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'

const AuthorizeDeviceInput = z.object({
  user_code: z.string().min(8).max(16),
})

export default defineApiHandler({
  schema: AuthorizeDeviceInput,
  policy: [authenticated],
  handler: async ({ event, body, user }) => {
    const now = Math.floor(Date.now() / 1000)
    const row = await event.context.platform.db.prepare(
      `SELECT user_code, status, expires_at
       FROM cli_device_sessions
       WHERE user_code = ?1`,
    ).bind(body.user_code).first<{ user_code: string, status: string, expires_at: number }>()

    if (!row || row.status !== 'pending' || row.expires_at <= now)
      throw createError({ statusCode: 400, message: 'Device code is not pending' })

    await event.context.platform.db.prepare(
      `UPDATE cli_device_sessions
       SET status = 'authorized', user_id = ?1, authorized_at = ?2
       WHERE user_code = ?3 AND status = 'pending'`,
    ).bind(user!.id, now, body.user_code).run()

    return { ok: true as const }
  },
})
