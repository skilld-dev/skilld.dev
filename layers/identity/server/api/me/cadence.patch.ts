import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { CadenceInput } from '../../schemas/cadence'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  schema: CadenceInput,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    const freq = body.frequency ?? u.digest_frequency
    const dow = body.dow ?? u.digest_dow ?? 1
    const hour = body.hour ?? u.digest_hour
    const tz = body.timezone ?? u.timezone

    await platform.db.prepare(
      `UPDATE users SET digest_frequency = ?1, digest_dow = ?2, digest_hour = ?3, timezone = ?4 WHERE id = ?5`,
    ).bind(freq, dow, hour, tz, u.id).run()

    return { ok: true as const }
  },
})
