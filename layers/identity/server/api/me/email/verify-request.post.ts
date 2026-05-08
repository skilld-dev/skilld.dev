import { generateEmailVerifyToken, hashEmailVerifyToken, sendEmail } from '../../../utils/email'
import { requireUserRow } from '../../../utils/users'

// Step 1 of email-change: store the pending address + token hash, send a
// verification link to the new address. Token is single-use, 24h TTL.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const u = await requireUserRow(event)
  const body = await readBody<{ digest_email?: string }>(event)
  const newEmail = (body?.digest_email ?? '').trim().slice(0, 254).toLowerCase()
  if (!newEmail || !newEmail.includes('@'))
    throw createError({ statusCode: 400, message: 'Invalid email' })

  const token = generateEmailVerifyToken()
  const tokenHash = await hashEmailVerifyToken(token)
  const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60

  const db = event.context.cloudflare.env.DB as D1Database
  await db.prepare(
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
})
