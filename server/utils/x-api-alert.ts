import type { SendEmailInput, SendEmailResult } from '#layers/identity/server/utils/email'
import type { XError } from '#shared/server/x-client'
import { sendEmailWithEnv } from '#layers/identity/server/utils/email'
import { describeXError } from '#shared/server/x-client'

const ALERT_REPEAT_SECONDS = 24 * 60 * 60

export type XApiTaskName = 'refresh-x-engagement' | 'sync-x-mentions'

export type XApiAlertResult
  = | { _tag: 'sent', messageId: string }
    | { _tag: 'deduplicated' }
    | { _tag: 'uncertain', error: string }
    | { _tag: 'send-failed', error: string }

interface NotifyXApiFailureInput {
  db: D1Database
  taskName: XApiTaskName
  error: XError
  now: number
  to: string
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}

interface NotifyXApiFailureWithEnvInput extends Omit<NotifyXApiFailureInput, 'send'> {
  env: Cloudflare.Env
  from: EmailAddress
}

function failureFingerprint(error: XError): string {
  if (error._tag === 'http-error')
    return `http-${error.status}`
  return error._tag
}

function failureDescription(error: XError): string {
  return describeXError(error).replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#039;',
  }
  return value.replace(/[&<>"']/g, character => entities[character]!)
}

export function buildXApiFailureEmail(input: {
  taskName: XApiTaskName
  error: XError
  now: number
  to: string
}): SendEmailInput {
  const cause = failureDescription(input.error)
  const observedAt = new Date(input.now * 1000).toISOString()
  const subject = `[skilld] X API failure: ${cause}`
  const text = [
    'skilld could not use the X API.',
    '',
    `Task: ${input.taskName}`,
    `Cause: ${cause}`,
    `Observed: ${observedAt}`,
    '',
    'You will get one alert per cause every 24 hours.',
  ].join('\n')
  const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(subject)}</title>
<h1 style="font-size:18px;">X API failure</h1>
<p>skilld could not use the X API.</p>
<p><strong>Task:</strong> ${escapeHtml(input.taskName)}<br>
<strong>Cause:</strong> ${escapeHtml(cause)}<br>
<strong>Observed:</strong> ${escapeHtml(observedAt)}</p>
<p style="color:#666;font-size:12px;">You will get one alert per cause every 24 hours.</p>`

  return { to: input.to, subject, text, html }
}

export async function notifyXApiFailure(input: NotifyXApiFailureInput): Promise<XApiAlertResult> {
  const fingerprint = failureFingerprint(input.error)
  const cause = failureDescription(input.error)
  const nextAlertAt = input.now + ALERT_REPEAT_SECONDS

  await input.db.prepare(
    `INSERT INTO x_api_alerts (
       fingerprint, first_seen_at, last_seen_at, next_alert_at, last_task, last_error
     ) VALUES (?1, ?2, ?2, ?2, ?3, ?4)
     ON CONFLICT(fingerprint) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       last_task = excluded.last_task,
       last_error = excluded.last_error`,
  ).bind(fingerprint, input.now, input.taskName, cause).run()

  const claim = await input.db.prepare(
    `UPDATE x_api_alerts
     SET next_alert_at = ?3
     WHERE fingerprint = ?1 AND next_alert_at <= ?2
     RETURNING fingerprint`,
  ).bind(fingerprint, input.now, nextAlertAt).first<{ fingerprint: string }>()

  if (!claim)
    return { _tag: 'deduplicated' }

  const delivery = await input.send(buildXApiFailureEmail(input)).then(
    result => ({ _tag: 'result' as const, result }),
    error => ({ _tag: 'threw' as const, error }),
  )

  if (delivery._tag === 'threw') {
    await releaseClaim(input.db, fingerprint, input.now, nextAlertAt)
    throw delivery.error
  }

  if (delivery.result._tag === 'rejected') {
    await releaseClaim(input.db, fingerprint, input.now, nextAlertAt)
    return { _tag: 'send-failed', error: delivery.result.error }
  }

  await input.db.prepare(
    `UPDATE x_api_alerts
     SET last_sent_at = ?2, message_id = ?3
     WHERE fingerprint = ?1 AND next_alert_at = ?4`,
  ).bind(
    fingerprint,
    input.now,
    delivery.result._tag === 'accepted' ? delivery.result.messageId : null,
    nextAlertAt,
  ).run()

  if (delivery.result._tag === 'uncertain')
    return { _tag: 'uncertain', error: delivery.result.error }
  return { _tag: 'sent', messageId: delivery.result.messageId }
}

export async function notifyXApiFailureWithEnv(
  input: NotifyXApiFailureWithEnvInput,
): Promise<XApiAlertResult> {
  return await notifyXApiFailure({
    ...input,
    send: email => sendEmailWithEnv(input.env, { ...email, from: input.from }),
  })
}

async function releaseClaim(
  db: D1Database,
  fingerprint: string,
  now: number,
  nextAlertAt: number,
): Promise<void> {
  await db.prepare(
    `UPDATE x_api_alerts
     SET next_alert_at = ?2
     WHERE fingerprint = ?1 AND next_alert_at = ?3`,
  ).bind(fingerprint, now, nextAlertAt).run()
}
