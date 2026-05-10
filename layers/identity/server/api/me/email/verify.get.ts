import { defineApiHandler } from '#shared/server/handler'
import { EmailVerifyQuery } from '../../../schemas/email'
import { hashEmailVerifyToken } from '../../../utils/email'

export default defineApiHandler({
  schema: EmailVerifyQuery,
  handler: async ({ event, body, platform }) => {
    const tokenHash = await hashEmailVerifyToken(body.t)
    const now = Math.floor(Date.now() / 1000)

    const row = await platform.db.prepare(
      `SELECT id, digest_email_pending, digest_email_token_expires_at
       FROM users
       WHERE digest_email_token_hash = ?1`,
    ).bind(tokenHash).first<{
      id: number
      digest_email_pending: string | null
      digest_email_token_expires_at: number | null
    }>()

    if (!row || !row.digest_email_pending || (row.digest_email_token_expires_at ?? 0) < now) {
      setResponseStatus(event, 400)
      return 'This verification link has expired or already been used.'
    }

    await platform.db.prepare(
      `UPDATE users
       SET digest_email = ?1,
           digest_email_pending = NULL,
           digest_email_token_hash = NULL,
           digest_email_token_expires_at = NULL
       WHERE id = ?2`,
    ).bind(row.digest_email_pending, row.id).run()

    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    return `<!doctype html><meta charset=utf-8><title>Email confirmed</title>
<div style="font-family:sans-serif;max-width:480px;margin:64px auto;padding:24px;border:1px solid #eee;border-radius:8px;">
<h1 style="margin:0 0 8px 0;font-size:20px;">Email confirmed.</h1>
<p style="color:#666;">Future digests will go to <strong>${row.digest_email_pending}</strong>. <a href="/me">Back to dashboard</a>.</p>
</div>`
  },
})
