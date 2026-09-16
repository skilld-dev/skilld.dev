import { OauthTokenInputSchema, TokenResponseSchema } from 'skilld-protocol/wire'
import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { issueSession, presentTokenResponse, sha256Base64Url } from '../../../utils/cli-tokens'
import { getUserById } from '../../../utils/users'

interface AuthCodeRow {
  code: string
  user_id: number
  code_challenge: string
  scopes: string
  cli_version: string | null
  redirect_port: number
  expires_at: number
  used_at: number | null
}

// The CLI names each sign-in with the computer hostname. Only the account owner sees it.
const TokenInputSchema = OauthTokenInputSchema.extend({
  device_label: z.string().trim().min(1).max(64).regex(/^\P{Cc}+$/u).optional(),
})

export default defineApiHandler({
  schema: TokenInputSchema,
  response: TokenResponseSchema,
  handler: async ({ event, body }) => {
    const row = await event.context.platform.db.prepare(
      `SELECT * FROM cli_auth_codes WHERE code = ?1`,
    ).bind(body.code).first<AuthCodeRow>()

    const now = Math.floor(Date.now() / 1000)
    if (!row || row.used_at || row.expires_at <= now)
      throw createError({ statusCode: 401, message: 'Invalid or expired code' })

    const redirect = new URL(body.redirect_uri)
    if (redirect.hostname !== '127.0.0.1' || Number(redirect.port) !== row.redirect_port)
      throw createError({ statusCode: 400, message: 'redirect_uri mismatch' })

    const challenge = await sha256Base64Url(body.code_verifier)
    if (challenge !== row.code_challenge)
      throw createError({ statusCode: 401, message: 'PKCE verification failed' })

    await event.context.platform.db.prepare(
      `UPDATE cli_auth_codes SET used_at = ?1 WHERE code = ?2 AND used_at IS NULL`,
    ).bind(now, row.code).run()

    const user = await getUserById(event, row.user_id)
    if (!user)
      throw createError({ statusCode: 401, message: 'User not found' })

    const session = await issueSession(event, row.user_id, {
      kind: 'oauth',
      scopes: row.scopes,
      cliVersion: row.cli_version ?? undefined,
      deviceLabel: body.device_label,
    })

    return presentTokenResponse(session, user.login)
  },
})
