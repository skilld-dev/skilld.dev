import type { SendEmailInput, SendEmailResult } from './email'
import type { UserRow } from './users'
import { SKILL_VALIDATION_COPY } from '#shared/skill-validation-copy'
import { loadAccountSkillValidation } from './skill-validation'
import { weeklyDeliveryActive } from './weekly-select'

interface ValidationEmailInput {
  db: D1Database
  user: UserRow
  send: (input: SendEmailInput) => Promise<SendEmailResult>
  now: number
}

/** One consented connection summary, claimed atomically before delivery. */
export async function sendSkillValidationSummary(input: ValidationEmailInput): Promise<'skipped' | SendEmailResult['_tag']> {
  const { db, user, send, now } = input
  if (!user.repo_indexing || (!user.email_opt_in && !weeklyDeliveryActive(user)))
    return 'skipped'
  const to = (user.digest_email ?? user.email ?? '').trim()
  if (!to)
    return 'skipped'
  const summary = await loadAccountSkillValidation(db, user.login)
  const invalid = summary.items.filter(item => item.issues.some(issue => issue.severity === 'error'))
  if (!invalid.length)
    return 'skipped'
  const claimed = await db.prepare(`
    INSERT INTO skill_validation_email_deliveries (user_id, status, attempted_at)
    VALUES (?1, 'claimed', ?2)
    ON CONFLICT(user_id) DO UPDATE SET status = 'claimed', attempted_at = excluded.attempted_at, error = NULL
    WHERE skill_validation_email_deliveries.status = 'rejected'
    RETURNING user_id
  `).bind(user.id, now).first<{ user_id: number }>()
  if (!claimed)
    return 'skipped'
  const link = 'https://skilld.dev/me?view=repositories'
  const count = `${invalid.length} ${invalid.length === 1 ? 'Skill has' : 'Skills have'} frontmatter issues.`
  const outcome = await send({
    to,
    subject: SKILL_VALIDATION_COPY.subject,
    html: `<h1>${SKILL_VALIDATION_COPY.subject}</h1><p>${count}</p><p><a href="${link}">${SKILL_VALIDATION_COPY.action}</a></p>`,
    text: `${count}\n\n${SKILL_VALIDATION_COPY.action}: ${link}`,
  }).catch((error): SendEmailResult => ({
    // A thrown send may have reached the provider. Do not risk duplicate delivery.
    _tag: 'uncertain',
    error: error instanceof Error ? error.message : String(error),
  }))
  await db.prepare(`UPDATE skill_validation_email_deliveries SET status = ?1, error = ?2 WHERE user_id = ?3`)
    .bind(outcome._tag, outcome._tag === 'accepted' ? null : outcome.error, user.id)
    .run()
  return outcome._tag
}
