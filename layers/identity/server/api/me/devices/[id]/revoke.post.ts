import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../../policies/authenticated'

const Params = z.object({})

export default defineApiHandler({
  schema: Params,
  policy: [authenticated],
  handler: async ({ event, user }) => {
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isInteger(id))
      throw createError({ statusCode: 400, message: 'Invalid token id' })

    await event.context.platform.db.prepare(
      `UPDATE cli_tokens SET revoked_at = ?1
       WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
    ).bind(Math.floor(Date.now() / 1000), id, user!.id).run()

    return { ok: true as const }
  },
})
