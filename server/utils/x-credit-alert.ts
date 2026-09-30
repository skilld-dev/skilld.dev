import type { SendEmailInput, SendEmailResult } from '#layers/identity/server/utils/email'
import { sendEmailWithEnv } from '#layers/identity/server/utils/email'
import { emitOperationalEvent } from './operational-event'

const ALERT_REPEAT_SECONDS = 24 * 60 * 60
const FINGERPRINT = 'credits-depleted'
const ADMIN_EMAIL = 'harlan@harlanzw.com'

type XTaskName = 'refresh-x-engagement' | 'sync-x-mentions'

type AlertResult
  = | { _tag: 'sent', messageId: string }
    | { _tag: 'deduplicated' }
    | { _tag: 'uncertain', error: string }
    | { _tag: 'send-failed', error: string }

interface CreditAlertInput {
  db: D1Database
  taskName: XTaskName
  now: number
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}

export async function notifyXCreditDepletion(input: CreditAlertInput): Promise<AlertResult> {
  const nextAlertAt = input.now + ALERT_REPEAT_SECONDS

  await input.db.prepare(
    `INSERT INTO x_api_alerts (
       fingerprint, first_seen_at, last_seen_at, next_alert_at, last_task, last_error
     ) VALUES (?1, ?2, ?2, ?2, ?3, ?4)
     ON CONFLICT(fingerprint) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       last_task = excluded.last_task,
       last_error = excluded.last_error`,
  ).bind(FINGERPRINT, input.now, input.taskName, 'X API credits depleted').run()

  const claim = await input.db.prepare(
    `UPDATE x_api_alerts
     SET next_alert_at = ?3
     WHERE fingerprint = ?1 AND next_alert_at <= ?2
     RETURNING fingerprint`,
  ).bind(FINGERPRINT, input.now, nextAlertAt).first<{ fingerprint: string }>()

  if (!claim)
    return { _tag: 'deduplicated' }

  const observedAt = new Date(input.now * 1000).toISOString()
  const text = [
    'The X API returned HTTP 402. skilld cannot read posts until credits are available.',
    '',
    `Task: ${input.taskName}`,
    `Observed: ${observedAt}`,
    '',
    'Check credits: https://console.x.com/',
    'You will get another email in 24 hours if the error continues.',
  ].join('\n')
  const delivery = await input.send({
    to: ADMIN_EMAIL,
    subject: '[skilld] X API credits depleted',
    text,
    html: `<p>The X API returned HTTP 402. skilld cannot read posts until credits are available.</p><p>Task: ${input.taskName}<br>Observed: ${observedAt}</p><p><a href="https://console.x.com/">Check credits</a></p><p>You will get another email in 24 hours if the error continues.</p>`,
  }).then(
    result => ({ _tag: 'result' as const, result }),
    error => ({ _tag: 'threw' as const, error }),
  )

  if (delivery._tag === 'threw') {
    await releaseClaim(input.db, input.now, nextAlertAt)
    throw delivery.error
  }
  if (delivery.result._tag === 'rejected') {
    await releaseClaim(input.db, input.now, nextAlertAt)
    return { _tag: 'send-failed', error: delivery.result.error }
  }

  await input.db.prepare(
    `UPDATE x_api_alerts
     SET last_sent_at = ?2, message_id = ?3
     WHERE fingerprint = ?1 AND next_alert_at = ?4`,
  ).bind(
    FINGERPRINT,
    input.now,
    delivery.result._tag === 'accepted' ? delivery.result.messageId : null,
    nextAlertAt,
  ).run()

  if (delivery.result._tag === 'uncertain')
    return { _tag: 'uncertain', error: delivery.result.error }
  return { _tag: 'sent', messageId: delivery.result.messageId }
}

export async function notifyXCreditDepletionWithEnv(input: Omit<CreditAlertInput, 'send'> & {
  env: Cloudflare.Env
  from: EmailAddress
}): Promise<void> {
  const outcome = await notifyXCreditDepletion({
    ...input,
    send: email => sendEmailWithEnv(input.env, { ...email, from: input.from }),
  }).catch((error: unknown) => {
    emitOperationalEvent(createWideEvent({
      operation: 'x-credit-alert',
      outcome: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }))
    return null
  })

  if (outcome?._tag === 'send-failed' || outcome?._tag === 'uncertain') {
    emitOperationalEvent(createWideEvent({
      operation: 'x-credit-alert',
      outcome: outcome._tag,
      reason: outcome.error,
    }))
  }
}

async function releaseClaim(db: D1Database, now: number, nextAlertAt: number): Promise<void> {
  await db.prepare(
    `UPDATE x_api_alerts
     SET next_alert_at = ?2
     WHERE fingerprint = ?1 AND next_alert_at = ?3`,
  ).bind(FINGERPRINT, now, nextAlertAt).run()
}
