import { defineApiHandler } from '#shared/server/handler'
import { identitySubscriptionsSchema } from '../../../../shared/contracts/account'
import { authenticated } from '../../../policies/authenticated'
import { requireUserRow } from '../../../utils/users'

interface Row {
  owner: string
  repo: string
  source: string
  muted_until: number | null
  created_at: number
}

export default defineApiHandler({
  policy: [authenticated],
  response: identitySubscriptionsSchema,
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const res = await platform.db.prepare(
      `SELECT owner, repo, source, muted_until, created_at
       FROM skill_subscriptions
       WHERE user_id = ?1
       ORDER BY created_at DESC`,
    ).bind(u.id).all<Row>()
    return { items: res.results ?? [] }
  },
})
