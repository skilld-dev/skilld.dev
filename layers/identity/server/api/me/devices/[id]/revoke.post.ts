import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../../policies/authenticated'
import { revokeCliToken } from '../../../../utils/cli-tokens'

const Params = z.object({})

export default defineApiHandler({
  schema: Params,
  policy: [authenticated],
  handler: async ({ event, user }) => {
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isInteger(id))
      throw createError({ statusCode: 400, message: 'Invalid token id' })

    await revokeCliToken(event.context.platform.db, user!.id, id)
    return { ok: true as const }
  },
})
