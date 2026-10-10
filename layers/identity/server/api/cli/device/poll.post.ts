import { DevicePollInputSchema, DevicePollResponseSchema } from 'skilld-protocol/wire'
import { defineApiHandler } from '#shared/server/handler'
import { issueSession, presentTokenResponse } from '../../../utils/cli-tokens'
import { emitSignupEvent } from '../../../utils/signup-analytics'
import { getUserById } from '../../../utils/users'

interface DeviceRow {
  device_code: string
  user_id: number | null
  cli_version: string | null
  status: 'pending' | 'authorized' | 'expired' | 'denied'
  expires_at: number
}

export default defineApiHandler({
  schema: DevicePollInputSchema,
  response: DevicePollResponseSchema,
  handler: async ({ event, body }) => {
    const row = await event.context.platform.db.prepare(
      `SELECT * FROM cli_device_sessions WHERE device_code = ?1`,
    ).bind(body.device_code).first<DeviceRow>()

    const now = Math.floor(Date.now() / 1000)
    if (!row)
      return { status: 'expired' as const }

    if (row.expires_at <= now && row.status === 'pending') {
      await event.context.platform.db.prepare(
        `UPDATE cli_device_sessions SET status = 'expired' WHERE device_code = ?1`,
      ).bind(row.device_code).run()
      return { status: 'expired' as const }
    }

    if (row.status !== 'authorized')
      return { status: row.status }

    if (!row.user_id)
      return { status: 'denied' as const }

    const user = await getUserById(event, row.user_id)
    if (!user)
      return { status: 'denied' as const }

    const tokens = await issueSession(event, row.user_id, {
      kind: 'oauth',
      cliVersion: row.cli_version ?? undefined,
    })

    await event.context.platform.db.prepare(
      `UPDATE cli_device_sessions SET status = 'expired' WHERE device_code = ?1`,
    ).bind(row.device_code).run()

    const response = { status: 'authorized' as const, tokens: presentTokenResponse(tokens, user.login) }
    emitSignupEvent(event, { stage: 'cli', outcome: 'connected', entry: 'device' })
    return response
  },
})
