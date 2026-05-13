import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { selectDigestForUser } from '../../utils/digest-select'
import { getUserById } from '../../utils/users'

const ChangesInput = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
})

export default defineApiHandler({
  schema: ChangesInput,
  policy: [authenticated],
  handler: async ({ event, body, user }) => {
    const row = await getUserById(event, user!.id)
    if (!row)
      throw createError({ statusCode: 401, message: 'User not found' })

    const now = Math.floor(Date.now() / 1000)
    const selection = await selectDigestForUser(event.context.platform.db, {
      id: row.id,
      login: row.login,
      digest_email: row.digest_email,
      email: row.email,
      email_opt_in: row.email_opt_in,
      digest_frequency: row.digest_frequency,
      digest_dow: row.digest_dow,
      digest_hour: row.digest_hour,
      timezone: row.timezone,
      onboarded_at: row.onboarded_at,
    }, now, { windowStart: body.since ?? 0 })

    return selection ?? {
      user: { id: row.id, login: row.login },
      windowStart: body.since ?? 0,
      windowEnd: now,
      entries: [],
    }
  },
})
