import type { SendEmailInput, SendEmailResult } from './email'
import { WELCOME_EMAIL_COPY as copy } from '#shared/welcome-email-copy'
import { digestEmailHeaders } from './email'

interface WelcomeEmailInput {
  db: D1Database
  userId: number
  to: string
  consent: boolean
  now: number
  attemptId: string
  signUnsubscribe: (userId: number) => Promise<string>
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}

export function renderWelcomeEmail(unsubscribeUrl: string): Pick<SendEmailInput, 'subject' | 'html' | 'text'> {
  const link = 'https://skilld.dev/me'
  const safeUnsubscribeUrl = unsubscribeUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return {
    subject: copy.subject,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.subject}</title></head>
<body style="margin:0;background:#f5f4f2;color:#1c1917;font-family:Arial,sans-serif">
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 16px">
<table role="presentation" style="width:100%;max-width:560px;margin:auto;border-collapse:collapse"><tr><td style="padding:28px;background:#fff;border:1px solid #d6d3d1;border-radius:8px">
<p style="margin:0 0 28px;font-family:monospace;font-size:20px;font-weight:bold">&gt; skilld<span style="color:#be123c">.</span></p>
<h1 style="font-size:26px;line-height:1.25;margin:0 0 24px">${copy.subject}</h1>
<p style="font-size:16px;line-height:1.6">${copy.greeting}</p>
<p style="font-size:16px;line-height:1.6">${copy.story}</p>
<p style="font-size:16px;line-height:1.6">${copy.account}</p>
<p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#be123c;color:#fff;text-decoration:none;font-weight:bold;padding:14px 20px;border-radius:8px">${copy.action}</a></p>
<p style="font-size:16px;line-height:1.6">${copy.feedback}</p>
<p style="font-size:16px;line-height:1.6;margin-bottom:0">${copy.signature}</p>
</td></tr><tr><td style="padding:16px 0;font-size:12px"><a href="${safeUnsubscribeUrl}" style="color:#57504b">${copy.unsubscribe}</a></td></tr></table>
</td></tr></table></body></html>`,
    text: `${copy.greeting}\n\n${copy.story}\n\n${copy.account}\n\n${copy.action}: ${link}\n\n${copy.feedback}\n\n${copy.signature}\n\n${copy.unsubscribe}: ${unsubscribeUrl}`,
  }
}

/** Only preparation can retry. Dispatch is terminal even if its receipt is lost. */
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<'skipped' | SendEmailResult['_tag']> {
  if (!input.consent || !input.to.trim())
    return 'skipped'
  const { db, userId, now, attemptId } = input
  const claimed = await db.prepare(`
    INSERT INTO welcome_email_deliveries (user_id, status, recipient, consented_at, attempted_at, attempt_id)
    VALUES (?1, 'claimed', ?2, ?3, ?3, ?4)
    ON CONFLICT(user_id) DO UPDATE SET attempted_at = excluded.attempted_at,
      attempt_id = excluded.attempt_id, recipient = excluded.recipient, consented_at = excluded.consented_at
    WHERE welcome_email_deliveries.status = 'claimed'
      AND welcome_email_deliveries.attempted_at < ?5
      AND welcome_email_deliveries.unsubscribed_at IS NULL
    RETURNING user_id
  `).bind(userId, input.to.trim(), now, attemptId, now - 300).first<{ user_id: number }>()
  if (!claimed)
    return 'skipped'
  const token = await input.signUnsubscribe(userId)
  const unsubscribeUrl = `https://skilld.dev/api/unsubscribe?t=${encodeURIComponent(token)}&list=welcome`
  const dispatch = await db.prepare(`UPDATE welcome_email_deliveries
    SET status = 'uncertain', error = 'Delivery started without a confirmed receipt'
    WHERE user_id = ?1 AND attempt_id = ?2 AND status = 'claimed' AND unsubscribed_at IS NULL
    RETURNING user_id`).bind(userId, attemptId).first<{ user_id: number }>()
  if (!dispatch)
    return 'skipped'
  const outcome = await input.send({
    to: input.to.trim(),
    replyTo: 'harlan@harlanzw.com',
    ...renderWelcomeEmail(unsubscribeUrl),
    headers: digestEmailHeaders(unsubscribeUrl, `skilld-welcome:${userId}`),
  }).catch((error): SendEmailResult => ({
    _tag: 'uncertain',
    error: error instanceof Error ? error.message : String(error),
  }))
  await db.prepare(`UPDATE welcome_email_deliveries SET status = ?1, message_id = ?2, error = ?3
    WHERE user_id = ?4 AND attempt_id = ?5 AND status = 'uncertain'`)
    .bind(outcome._tag, outcome._tag === 'accepted' ? outcome.messageId : null, outcome._tag === 'accepted' ? null : outcome.error, userId, attemptId)
    .run()
  return outcome._tag
}
