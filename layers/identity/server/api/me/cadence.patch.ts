import { requireUserRow } from '../../utils/users'

interface Body {
  frequency?: 'weekly' | 'daily' | 'off'
  dow?: number
  hour?: number
  timezone?: string
}

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const body = await readBody<Body>(event)
  const freq = body?.frequency ?? u.digest_frequency
  if (!['weekly', 'daily', 'off'].includes(freq))
    throw createError({ statusCode: 400, message: 'Invalid frequency' })
  const dow = typeof body?.dow === 'number' && body.dow >= 0 && body.dow <= 6 ? body.dow : (u.digest_dow ?? 1)
  const hour = typeof body?.hour === 'number' && body.hour >= 0 && body.hour <= 23 ? body.hour : u.digest_hour
  const tz = typeof body?.timezone === 'string' && body.timezone ? body.timezone.slice(0, 64) : u.timezone
  const db = event.context.cloudflare.env.DB as D1Database
  await db.prepare(
    `UPDATE users SET digest_frequency = ?1, digest_dow = ?2, digest_hour = ?3, timezone = ?4 WHERE id = ?5`,
  ).bind(freq, dow, hour, tz, u.id).run()
  return { ok: true }
})
