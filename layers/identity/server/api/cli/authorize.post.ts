import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { randomBase64Url } from '../../utils/cli-tokens'

const AuthorizeInput = z.object({
  challenge: z.string().min(32).max(256),
  port: z.coerce.number().int().min(1024).max(65535),
  state: z.string().min(8).max(256),
  v: z.string().max(32).optional(),
})

export default defineApiHandler({
  schema: AuthorizeInput,
  policy: [authenticated],
  handler: async ({ event, body, user }) => {
    const now = Math.floor(Date.now() / 1000)
    const code = randomBase64Url(32)
    await event.context.platform.db.prepare(
      `INSERT INTO cli_auth_codes (
         code, user_id, code_challenge, scopes, cli_version,
         redirect_port, state, created_at, expires_at
       ) VALUES (?1, ?2, ?3, 'cli', ?4, ?5, ?6, ?7, ?8)`,
    ).bind(code, user!.id, body.challenge, body.v ?? null, body.port, body.state, now, now + 300).run()

    return {
      redirect: `http://127.0.0.1:${body.port}/?code=${encodeURIComponent(code)}&state=${encodeURIComponent(body.state)}`,
    }
  },
})
