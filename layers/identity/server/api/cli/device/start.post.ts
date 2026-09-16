import { DeviceStartInputSchema, DeviceStartResponseSchema } from 'skilld-protocol/wire'
import { defineApiHandler } from '#shared/server/handler'
import { randomBase64Url } from '../../../utils/cli-tokens'

const USER_CODE_ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXYZ'

export default defineApiHandler({
  schema: DeviceStartInputSchema,
  response: DeviceStartResponseSchema,
  handler: async ({ event, body }) => {
    const now = Math.floor(Date.now() / 1000)
    const deviceCode = randomBase64Url(32)
    const userCode = makeUserCode()
    await event.context.platform.db.prepare(
      `INSERT INTO cli_device_sessions (
         device_code, user_code, cli_version,
         status, created_at, expires_at
       ) VALUES (?1, ?2, ?3, 'pending', ?4, ?5)`,
    ).bind(deviceCode, userCode, body.cli_version, now, now + 600).run()

    const site = useRuntimeConfig(event).publicSiteUrl as string
    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${site}/cli/authorize?user_code=${encodeURIComponent(userCode)}`,
      interval: 5,
      expires_in: 600,
    }
  },
})

function makeUserCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = [...bytes].map(byte => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}
