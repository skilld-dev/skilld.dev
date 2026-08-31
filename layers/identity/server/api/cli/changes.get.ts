import { DigestResponseSchema } from 'skilld-protocol/wire'
import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { toCliDigest } from '../../utils/cli-digest'
import { selectDigestForUser } from '../../utils/digest-select'
import { getUserById } from '../../utils/users'

const ChangesInput = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
})

export default defineApiHandler({
  schema: ChangesInput,
  response: DigestResponseSchema,
  policy: [authenticated],
  handler: async ({ event, body, user }) => {
    const row = await getUserById(event, user!.id)
    if (!row)
      throw createError({ statusCode: 401, message: 'User not found' })

    const now = Math.floor(Date.now() / 1000)
    const digestUser = {
      id: row.id,
      login: row.login,
      digest_email: row.digest_email,
      email: row.email,
      email_opt_in: row.email_opt_in,
      onboarded_at: row.onboarded_at,
    }
    const selection = await selectDigestForUser(event.context.platform.db, digestUser, now, { windowStart: body.since ?? 0 })

    return toCliDigest(selection ?? {
      user: digestUser,
      windowStart: body.since ?? 0,
      windowEnd: now,
      cursorStart: 0,
      cursorEnd: 0,
      entries: [],
    })
  },
})
