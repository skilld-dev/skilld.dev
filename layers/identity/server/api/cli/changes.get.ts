import { DigestResponseSchema } from 'skilld-protocol/wire'
import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { selectAccountChanges } from '../../utils/account-changes'
import { toCliDigest } from '../../utils/cli-digest'
import { getUserById } from '../../utils/users'

const ChangesInput = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
})

/** `skilld changes` in the v2 CLI reads this route. The v3 CLI has no such command; API clients read `changes.list`. */
export default defineApiHandler({
  schema: ChangesInput,
  response: DigestResponseSchema,
  policy: [authenticated],
  handler: async ({ event, body, user }) => {
    const row = await getUserById(event, user!.id)
    if (!row)
      throw createError({ statusCode: 401, message: 'User not found' })
    const now = Math.floor(Date.now() / 1000)
    return toCliDigest(await selectAccountChanges(event.context.platform.db, row, body.since ?? 0, now))
  },
})
