import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { EmailVerifyRequestInput } from '../../../schemas/email'
import { generateEmailVerifyToken, hashEmailVerifyToken, sendEmail } from '../../../utils/email'
import { requireUserRow } from '../../../utils/users'

export default defineApiHandler({
  schema: EmailVerifyRequestInput,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const config = useRuntimeConfig(event)
    const u = await requireUserRow(event)
    const newEmail = body.digest_email

    const token = generateEmailVerifyToken()
    const tokenHash = await hashEmailVerifyToken(token)
    const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    await platform.db.prepare(
      `UPDATE users
       SET digest_email_pending = ?1,
           digest_email_token_hash = ?2,
           digest_email_token_expires_at = ?3
       WHERE id = ?4`,
    ).bind(newEmail, tokenHash, expires, u.id).run()

    const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'
    const link = `${siteUrl}/api/me/email/verify?t=${encodeURIComponent(token)}`
    const html = `<!doctype html><meta charset=utf-8><title>Confirm your email</title>
<div style="font-family:sans-serif;max-width:480px;margin:24px auto;">
<h1 style="font-size:18px;">Confirm this email for skilld digests</h1>
<p>Click the link below to start receiving the weekly digest at this address:</p>
<p><a href="${link}">${link}</a></p>
<p style="color:#666;font-size:12px;">This link expires in 24 hours. If you didn't request this, ignore this email.</p>
</div>`
    const text = `Confirm this email for skilld digests:\n\n${link}\n\nThis link expires in 24 hours. If you didn't request this, ignore this email.`

    const res = await sendEmail(event, { to: newEmail, subject: 'Confirm your skilld digest email', html, text })
    return { ok: res.ok, error: res.error }
  },
})
