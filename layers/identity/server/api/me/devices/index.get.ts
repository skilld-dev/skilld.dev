import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, user }) => {
    const res = await event.context.platform.db.prepare(
      `SELECT id, kind, device_label, cli_version, scopes, created_at, last_used_at, expires_at, revoked_at
       FROM cli_tokens
       WHERE user_id = ?1
       ORDER BY revoked_at IS NOT NULL ASC, last_used_at DESC`,
    ).bind(user!.id).all()
    return { items: res.results ?? [] }
  },
})
