/// <reference types="@cloudflare/workers-types" />

/**
 * Sending one person's weekly, exactly once.
 *
 * The cron fires hourly and a Cloudflare trigger can replay, so the claim is
 * the whole design: a unique index on `(user_id, window_end)` decides the
 * winner in the database, before any mail is sent. Everything else here is
 * recording what happened to a row that was already won.
 *
 * Dependencies are passed in rather than imported so a test can run the whole
 * path with a fake sender and a real D1.
 */

import type { SendEmailInput, SendEmailResult } from './email'
import type { WeeklyRecipient } from './weekly-select'
import type { WeeklyRender, WeeklyRenderInput, WeeklyTrendingSkill } from './weekly-template'
import { recordWeeklySkillsSent } from './weekly-history'
import { resolveRecipientAddress } from './weekly-select'

export interface WeeklyDeliveryDependencies {
  db: D1Database
  now: () => number
  render: (input: WeeklyRenderInput) => WeeklyRender
  signUnsubscribe: (userId: number) => Promise<string>
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}

export type WeeklyDeliveryResult
  = { _tag: 'sent', runId: number, providerMessageId: string }
    | { _tag: 'skipped', reason: 'nothing_to_say' | 'no_address' }
    | { _tag: 'already_claimed' }
    | { _tag: 'failed', stage: 'provider' | 'preflight', error: string }
    | { _tag: 'uncertain', error: string }

export interface WeeklyDeliveryInput {
  windowStart: number
  windowEnd: number
  /** Loaded once per run and shared by every recipient. */
  trending: WeeklyTrendingSkill[]
  siteUrl: string
}

/**
 * Take the week for this person, or discover someone already has.
 *
 * `INSERT ... ON CONFLICT DO NOTHING` returns no row when the unique index
 * rejects it, and that is the signal. Reading first and inserting second would
 * leave a window where two invocations both read "no run" and both send.
 */
async function claimWeek(
  db: D1Database,
  user: WeeklyRecipient,
  input: WeeklyDeliveryInput,
  claimedAt: number,
): Promise<{ _tag: 'acquired', runId: number } | { _tag: 'taken' }> {
  const row = await db.prepare(
    `INSERT INTO weekly_runs (user_id, window_start, window_end, status, claimed_at)
     VALUES (?1, ?2, ?3, 'claimed', ?4)
     ON CONFLICT (user_id, window_end) DO NOTHING
     RETURNING id`,
  ).bind(user.id, input.windowStart, input.windowEnd, claimedAt).first<{ id: number }>()

  return row ? { _tag: 'acquired', runId: row.id } : { _tag: 'taken' }
}

async function finish(
  db: D1Database,
  runId: number,
  fields: {
    status: 'sent' | 'skipped' | 'failed' | 'uncertain'
    likedCount?: number
    trendingCount?: number
    providerMessageId?: string | null
    providerStatus?: string | null
    sentAt?: number | null
    error?: string | null
  },
): Promise<void> {
  await db.prepare(
    `UPDATE weekly_runs
     SET status = ?2,
         liked_count = ?3,
         trending_count = ?4,
         provider_message_id = ?5,
         provider_status = ?6,
         sent_at = ?7,
         error = ?8
     WHERE id = ?1`,
  ).bind(
    runId,
    fields.status,
    fields.likedCount ?? 0,
    fields.trendingCount ?? 0,
    fields.providerMessageId ?? null,
    fields.providerStatus ?? null,
    fields.sentAt ?? null,
    fields.error ?? null,
  ).run()
}

export async function runWeeklyForUser(
  deps: WeeklyDeliveryDependencies,
  user: WeeklyRecipient,
  input: WeeklyDeliveryInput,
): Promise<WeeklyDeliveryResult> {
  const address = resolveRecipientAddress(user)
  if (address._tag === 'no_address')
    return { _tag: 'skipped', reason: 'no_address' }

  const claim = await claimWeek(deps.db, user, input, deps.now())
  if (claim._tag === 'taken')
    return { _tag: 'already_claimed' }

  if (!input.trending.length) {
    await finish(deps.db, claim.runId, { status: 'skipped' })
    return { _tag: 'skipped', reason: 'nothing_to_say' }
  }

  const unsubscribeToken = await deps.signUnsubscribe(user.id)
  const unsubscribeUrl = `${input.siteUrl}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken)}&list=weekly`
  const rendered = deps.render({
    recipientName: user.name ?? null,
    userId: user.id,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    likedChanges: [],
    likedOverflow: 0,
    trackedCount: 0,
    trending: input.trending,
    siteUrl: input.siteUrl,
    unsubscribeUrl,
    settingsUrl: `${input.siteUrl}/me`,
  })

  const counts = {
    likedCount: 0,
    trendingCount: input.trending.length,
  }

  const result = await deps.send({
    to: address.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  if (result._tag === 'accepted') {
    const sentAt = deps.now()
    await finish(deps.db, claim.runId, {
      ...counts,
      status: 'sent',
      providerMessageId: result.messageId,
      providerStatus: 'accepted',
      sentAt,
    })
    await recordWeeklySkillsSent(deps.db, {
      windowEnd: input.windowEnd,
      sentAt,
      skills: input.trending,
    })
    return { _tag: 'sent', runId: claim.runId, providerMessageId: result.messageId }
  }

  // An `uncertain` provider response means the mail may have gone out. The run
  // stays claimed and is never retried, because a duplicate weekly is worse
  // than a missed one.
  if (result._tag === 'uncertain') {
    await finish(deps.db, claim.runId, { ...counts, status: 'uncertain', error: result.error })
    await recordWeeklySkillsSent(deps.db, {
      windowEnd: input.windowEnd,
      sentAt: deps.now(),
      skills: input.trending,
    })
    return { _tag: 'uncertain', error: result.error }
  }

  await finish(deps.db, claim.runId, { ...counts, status: 'failed', error: result.error })
  return { _tag: 'failed', stage: 'provider', error: result.error }
}
