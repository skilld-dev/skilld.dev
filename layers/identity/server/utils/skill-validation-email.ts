import type { SendEmailInput, SendEmailResult } from './email'
import type { UserRow } from './users'
import { SKILL_VALIDATION_COPY } from '#shared/skill-validation-copy'
import { digestEmailHeaders } from './email'
import { loadAccountSkillValidation } from './skill-validation'
import { weeklyDeliveryActive } from './weekly-select'

interface ValidationEmailInput {
  db: D1Database
  user: UserRow
  send: (input: SendEmailInput) => Promise<SendEmailResult>
  now: number
  signUnsubscribe: (userId: number) => Promise<string>
}

const CLAIM_LEASE_SECONDS = 300

/** One consented connection summary, claimed atomically before delivery. */
export async function sendSkillValidationSummary(input: ValidationEmailInput): Promise<'skipped' | SendEmailResult['_tag']> {
  const { db, user, send, now } = input
  if (!user.repo_indexing || (!user.email_opt_in && !weeklyDeliveryActive(user)))
    return 'skipped'
  const to = (user.digest_email ?? user.email ?? '').trim()
  if (!to)
    return 'skipped'
  const prior = await db.prepare(`SELECT status, attempted_at FROM skill_validation_email_deliveries WHERE user_id = ?1`)
    .bind(user.id)
    .first<{ status: string, attempted_at: number }>()
  if (prior && (prior.status === 'accepted' || prior.status === 'uncertain'
    || (prior.status === 'claimed' && prior.attempted_at >= now - CLAIM_LEASE_SECONDS))) {
    return 'skipped'
  }
  const summary = await loadAccountSkillValidation(db, user.login)
  const invalid = summary.items.filter(item => item.issues.some(issue => issue.severity === 'error'))
  if (!invalid.length)
    return 'skipped'
  const token = await input.signUnsubscribe(user.id)
  const list = user.email_opt_in ? 'digest' : 'weekly'
  const unsubscribeUrl = `https://skilld.dev/api/unsubscribe?t=${encodeURIComponent(token)}&list=${list}`
  const claimed = await db.prepare(`
    INSERT INTO skill_validation_email_deliveries (user_id, status, attempted_at)
    VALUES (?1, 'claimed', ?2)
    ON CONFLICT(user_id) DO UPDATE SET status = 'claimed', attempted_at = excluded.attempted_at, error = NULL
    WHERE skill_validation_email_deliveries.status = 'rejected'
      OR (skill_validation_email_deliveries.status = 'claimed' AND skill_validation_email_deliveries.attempted_at < ?3)
    RETURNING user_id
  `).bind(user.id, now, now - CLAIM_LEASE_SECONDS).first<{ user_id: number }>()
  if (!claimed)
    return 'skipped'
  // Only pre-send claims can expire. Fence old workers before dispatch.
  // A crash after this transition leaves ambiguous delivery blocked.
  const dispatch = await db.prepare(`UPDATE skill_validation_email_deliveries
    SET status = 'uncertain', error = 'Delivery started without a confirmed receipt'
    WHERE user_id = ?1 AND attempted_at = ?2 AND status = 'claimed'
    RETURNING user_id`).bind(user.id, now).first<{ user_id: number }>()
  if (!dispatch)
    return 'skipped'
  const link = 'https://skilld.dev/me?view=repositories'
  const count = `${invalid.length} ${invalid.length === 1 ? 'Skill has' : 'Skills have'} frontmatter issues.`
  const outcome = await send({
    to,
    subject: SKILL_VALIDATION_COPY.subject,
    html: `<h1>${SKILL_VALIDATION_COPY.subject}</h1><p>${count}</p><p><a href="${link}">${SKILL_VALIDATION_COPY.action}</a></p>`,
    text: `${count}\n\n${SKILL_VALIDATION_COPY.action}: ${link}`,
    headers: digestEmailHeaders(unsubscribeUrl, `skilld-validation:${user.id}`),
  }).catch((error): SendEmailResult => ({
    // A thrown send may have reached the provider. Do not risk duplicate delivery.
    _tag: 'uncertain',
    error: error instanceof Error ? error.message : String(error),
  }))
  await db.prepare(`UPDATE skill_validation_email_deliveries SET status = ?1, error = ?2
    WHERE user_id = ?3 AND attempted_at = ?4 AND status = 'uncertain'`)
    .bind(outcome._tag, outcome._tag === 'accepted' ? null : outcome.error, user.id, now)
    .run()
  return outcome._tag
}
