import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { LikeCreateInput } from '../../../schemas/likes'
import { likeSkill } from '../../../utils/likes'
import { requireUserRow } from '../../../utils/users'

export default defineApiHandler({
  schema: LikeCreateInput,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    await likeSkill(platform.db, u.id, body)
    return { ok: true as const }
  },
})
