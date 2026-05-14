import { OauthRefreshInputSchema, TokenResponseSchema } from 'skilld-protocol/wire'
import { defineApiHandler } from '#shared/server/handler'
import { rotateSession } from '../../../utils/cli-tokens'
import { getUserById } from '../../../utils/users'

export default defineApiHandler({
  schema: OauthRefreshInputSchema,
  response: TokenResponseSchema,
  handler: async ({ event, body }) => {
    const session = await rotateSession(event, body.refresh_token)
    if (!session)
      throw createError({ statusCode: 401, message: 'Invalid refresh token' })
    const user = session.userId ? await getUserById(event, session.userId) : null
    if (!user)
      throw createError({ statusCode: 401, message: 'User not found' })
    return { ...session, login: user.login }
  },
})
