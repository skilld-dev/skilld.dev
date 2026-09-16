import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'

const LookupInput = z.object({
  user_code: z.string().min(8).max(16),
})

export default defineApiHandler({
  schema: LookupInput,
  handler: async ({ event, body }) => {
    const row = await event.context.platform.db.prepare(
      `SELECT user_code, cli_version, machine_hint, expires_at, status
       FROM cli_device_sessions
       WHERE user_code = ?1`,
    ).bind(body.user_code).first<{
      user_code: string
      cli_version: string | null
      machine_hint: string | null
      expires_at: number
      status: string
    }>()

    if (!row)
      throw createError({ statusCode: 404, message: 'Device code not found' })

    return row
  },
})
