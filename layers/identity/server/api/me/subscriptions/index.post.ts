import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { SubscriptionsCreateInput } from '../../../schemas/subscriptions'
import { requireUserRow } from '../../../utils/users'

export default defineApiHandler({
  schema: SubscriptionsCreateInput,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    if (!body.repos.length)
      return { ok: true as const, inserted: 0 }
    const now = Math.floor(Date.now() / 1000)
    const stmts = body.repos.map(r => platform.db.prepare(
      `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(u.id, r.owner, r.repo, body.source, now))
    await platform.db.batch(stmts)
    return { ok: true as const, inserted: stmts.length }
  },
})
