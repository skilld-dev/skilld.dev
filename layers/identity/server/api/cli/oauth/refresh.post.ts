import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { rotateSession } from '../../../utils/cli-tokens'

const RefreshInput = z.object({
  refresh_token: z.string().min(16),
})

export default defineApiHandler({
  schema: RefreshInput,
  handler: async ({ event, body }) => {
    const session = await rotateSession(event, body.refresh_token)
    if (!session)
      throw createError({ statusCode: 401, message: 'Invalid refresh token' })
    return session
  },
})
