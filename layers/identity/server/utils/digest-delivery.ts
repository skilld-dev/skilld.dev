/// <reference types="@cloudflare/workers-types" />

import type {
  DigestSelection,
  DigestUser,
  selectDigestForUser,
} from './digest-select'
import type {
  RepoChange,
  SubscriptionContext,
  SummariseResult,
} from './digest-summary'
import type {
  DigestRender,
  DigestRenderInput,
} from './digest-template'
import type {
  SendEmailInput,
  SendEmailResult,
} from './email'

const CLAIM_TTL_SECONDS = 5 * 60

interface DigestRunRow {
  id: number
  user_id: number
  delivery_key: string
  window_start: number
  window_end: number
  cursor_start: number
  cursor_end: number
  status: 'claimed' | 'sending' | 'uncertain' | 'failed' | 'sent' | 'skipped'
  claim_token: string
  claimed_at: number
  claim_expires_at: number | null
  attempt_count: number
  provider_message_id: string | null
  provider_status: string | null
  error_code: string | null
  error_message: string | null
}

export interface DigestSummaryInput {
  subscriptions: SubscriptionContext[]
  changes: RepoChange[]
}

export interface DigestDeliveryDependencies {
  db: D1Database
  now: () => number
  newClaimToken: () => string
  select: typeof selectDigestForUser
  summarise: (input: DigestSummaryInput) => Promise<SummariseResult>
  render: (input: DigestRenderInput) => DigestRender
  signUnsubscribe: (userId: number) => Promise<string>
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}

export type DigestDeliveryResult
  = {
    _tag: 'sent'
    deliveryKey: string
    providerMessageId: string
    aiFallbackReason: string | null
  }
  | { _tag: 'skipped', deliveryKey: string }
  | {
    _tag: 'failed'
    deliveryKey: string
    stage: 'preflight' | 'provider'
    error: string
  }
  | {
    _tag: 'claimed'
    deliveryKey: string
    reason: 'active_claim' | 'concurrent_claim'
  }
  | {
    _tag: 'already_processed'
    deliveryKey: string
    status: 'sent' | 'skipped'
  }
  | {
    _tag: 'delivery_uncertain'
    deliveryKey: string
    reason:
      | 'prior_sending'
      | 'prior_uncertain'
      | 'provider_threw'
      | 'provider_uncertain'
      | 'provider_success_persistence_failed'
    error: string
  }

type ClaimResult
  = { _tag: 'acquired', run: DigestRunRow }
    | Exclude<DigestDeliveryResult, { _tag: 'sent' | 'skipped' | 'failed' }>

export function normalizeDigestWindowEnd(epochSeconds: number): number {
  return Math.floor(epochSeconds / 3_600) * 3_600
}

export function digestDeliveryKey(userId: number, windowEnd: number): string {
  return `skilld-digest:${userId}:${windowEnd}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadOpenRun(db: D1Database, userId: number): Promise<DigestRunRow | null> {
  return await db.prepare(
    `SELECT id, user_id, delivery_key, window_start, window_end,
            cursor_start, cursor_end, status, claim_token, claimed_at,
            claim_expires_at, attempt_count, provider_message_id,
            provider_status, error_code, error_message
     FROM digest_runs
     WHERE user_id = ?1
       AND status IN ('sending', 'uncertain', 'failed', 'claimed')
     ORDER BY window_end ASC
     LIMIT 1`,
  ).bind(userId).first<DigestRunRow>()
}

async function loadWindowRun(
  db: D1Database,
  userId: number,
  windowEnd: number,
): Promise<DigestRunRow | null> {
  return await db.prepare(
    `SELECT id, user_id, delivery_key, window_start, window_end,
            cursor_start, cursor_end, status, claim_token, claimed_at,
            claim_expires_at, attempt_count, provider_message_id,
            provider_status, error_code, error_message
     FROM digest_runs
     WHERE user_id = ?1 AND window_end = ?2`,
  ).bind(userId, windowEnd).first<DigestRunRow>()
}

function blockedClaim(run: DigestRunRow): ClaimResult {
  if (run.status === 'sending') {
    return {
      _tag: 'delivery_uncertain',
      deliveryKey: run.delivery_key,
      reason: 'prior_sending',
      error: 'A prior provider call has no confirmed terminal D1 state',
    }
  }
  if (run.status === 'uncertain') {
    return {
      _tag: 'delivery_uncertain',
      deliveryKey: run.delivery_key,
      reason: 'prior_uncertain',
      error: run.error_message ?? 'A prior provider outcome requires reconciliation',
    }
  }
  if (run.status === 'sent' || run.status === 'skipped') {
    return {
      _tag: 'already_processed',
      deliveryKey: run.delivery_key,
      status: run.status,
    }
  }
  return {
    _tag: 'claimed',
    deliveryKey: run.delivery_key,
    reason: 'active_claim',
  }
}

async function finalizeAcceptedUnpersisted(
  deps: DigestDeliveryDependencies,
  run: DigestRunRow,
): Promise<ClaimResult> {
  const finalized = await deps.db.prepare(
    `UPDATE digest_runs
     SET status = 'sent',
         sent_at = finished_at,
         provider_status = 'accepted',
         error_code = NULL,
         error_message = NULL
     WHERE id = ?1
       AND claim_token = ?2
       AND status = 'uncertain'
       AND provider_status = 'accepted_unpersisted'
       AND provider_message_id IS NOT NULL`,
  ).bind(run.id, run.claim_token).run().then(
    result => ({ _tag: 'result' as const, changes: result.meta?.changes ?? 0 }),
    error => ({ _tag: 'failure' as const, error: errorMessage(error) }),
  )
  if (finalized._tag === 'failure') {
    return {
      _tag: 'delivery_uncertain',
      deliveryKey: run.delivery_key,
      reason: 'prior_uncertain',
      error: `Accepted provider outcome could not be finalized: ${finalized.error}`,
    }
  }
  if (!finalized.changes) {
    const current = await loadWindowRun(deps.db, run.user_id, run.window_end)
    if (!current)
      throw new Error(`Digest run ${run.id} disappeared during accepted-outcome recovery`)
    return blockedClaim(current)
  }
  return {
    _tag: 'already_processed',
    deliveryKey: run.delivery_key,
    status: 'sent',
  }
}

async function reclaimRun(
  deps: DigestDeliveryDependencies,
  run: DigestRunRow,
  claimToken: string,
  claimedAt: number,
): Promise<ClaimResult> {
  const result = await deps.db.prepare(
    `UPDATE digest_runs
     SET status = 'claimed',
         claim_token = ?1,
         claimed_at = ?2,
         claim_expires_at = ?3,
         sending_at = NULL,
         sent_at = NULL,
         finished_at = NULL,
         change_count = 0,
         provider_message_id = NULL,
         provider_status = NULL,
         error_code = NULL,
         error_message = NULL,
         ai_summary_used = 0,
         ai_fallback_reason = NULL,
         ai_input_tokens = 0,
         ai_output_tokens = 0,
         attempt_count = attempt_count + 1
     WHERE id = ?4
       AND (
         status = 'failed'
         OR (status = 'claimed' AND claim_expires_at <= ?2)
       )`,
  ).bind(
    claimToken,
    claimedAt,
    claimedAt + CLAIM_TTL_SECONDS,
    run.id,
  ).run()
  if (!result.meta?.changes) {
    const current = await loadWindowRun(deps.db, run.user_id, run.window_end)
    if (!current)
      throw new Error(`Digest run ${run.id} disappeared during claim`)
    return blockedClaim(current)
  }
  const claimed = await loadWindowRun(deps.db, run.user_id, run.window_end)
  if (!claimed || claimed.status !== 'claimed' || claimed.claim_token !== claimToken)
    throw new Error(`Digest run ${run.id} claim could not be confirmed`)
  return { _tag: 'acquired', run: claimed }
}

async function initialCursor(
  db: D1Database,
  onboardedAt: number,
): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(id), 0) AS cursor
     FROM activity
     WHERE ingested_at <= ?1`,
  ).bind(onboardedAt).first<{ cursor: number }>()
  return row?.cursor ?? 0
}

async function latestProcessedRun(
  db: D1Database,
  userId: number,
): Promise<{ window_end: number, cursor_end: number } | null> {
  return await db.prepare(
    `SELECT window_end, cursor_end
     FROM digest_runs
     WHERE user_id = ?1
       AND status IN ('sent', 'skipped')
     ORDER BY window_end DESC
     LIMIT 1`,
  ).bind(userId).first<{ window_end: number, cursor_end: number }>()
}

async function highWaterCursor(db: D1Database): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(id), 0) AS cursor FROM activity`,
  ).first<{ cursor: number }>()
  return row?.cursor ?? 0
}

async function claimDigestWindow(
  deps: DigestDeliveryDependencies,
  user: DigestUser,
  scheduledAt: number,
): Promise<ClaimResult> {
  const claimedAt = deps.now()
  const claimToken = deps.newClaimToken()
  const open = await loadOpenRun(deps.db, user.id)
  if (open) {
    if (open.status === 'uncertain' && open.provider_status === 'accepted_unpersisted')
      return await finalizeAcceptedUnpersisted(deps, open)
    if (open.status === 'sending')
      return blockedClaim(open)
    if (open.status === 'uncertain')
      return blockedClaim(open)
    if (open.status === 'claimed' && (open.claim_expires_at ?? 0) > claimedAt)
      return blockedClaim(open)
    return await reclaimRun(deps, open, claimToken, claimedAt)
  }

  const windowEnd = normalizeDigestWindowEnd(scheduledAt)
  const processed = await latestProcessedRun(deps.db, user.id)
  const onboardedAt = user.onboarded_at ?? 0
  const cursorStart = processed?.cursor_end ?? await initialCursor(deps.db, onboardedAt)
  const cursorEnd = Math.max(cursorStart, await highWaterCursor(deps.db))
  const windowStart = processed?.window_end ?? onboardedAt
  const deliveryKey = digestDeliveryKey(user.id, windowEnd)
  const inserted = await deps.db.prepare(
    `INSERT INTO digest_runs (
       user_id, delivery_key, window_start, window_end, cursor_start, cursor_end,
       change_count, status, claim_token, claimed_at, claim_expires_at,
       attempt_count
     ) VALUES (
       ?1, ?2, ?3, ?4, ?5, ?6,
       0, 'claimed', ?7, ?8, ?9,
       1
     )
     ON CONFLICT DO NOTHING`,
  ).bind(
    user.id,
    deliveryKey,
    windowStart,
    windowEnd,
    cursorStart,
    cursorEnd,
    claimToken,
    claimedAt,
    claimedAt + CLAIM_TTL_SECONDS,
  ).run()
  if (!inserted.meta?.changes) {
    const conflict = await loadWindowRun(deps.db, user.id, windowEnd)
      ?? await loadOpenRun(deps.db, user.id)
    if (!conflict)
      throw new Error(`Digest claim conflict for ${deliveryKey} could not be resolved`)
    const blocked = blockedClaim(conflict)
    if (blocked._tag === 'claimed') {
      return {
        ...blocked,
        reason: 'concurrent_claim',
      }
    }
    return blocked
  }
  const run = await loadWindowRun(deps.db, user.id, windowEnd)
  if (!run || run.status !== 'claimed' || run.claim_token !== claimToken)
    throw new Error(`Digest claim ${deliveryKey} could not be confirmed`)
  return { _tag: 'acquired', run }
}

async function markFailed(
  deps: DigestDeliveryDependencies,
  run: DigestRunRow,
  input: {
    stage: 'preflight' | 'provider'
    errorCode: string
    errorMessage: string
    providerStatus?: string
  },
): Promise<DigestDeliveryResult> {
  const result = await deps.db.prepare(
    `UPDATE digest_runs
     SET status = 'failed',
         claim_expires_at = NULL,
         finished_at = ?1,
         provider_status = ?2,
         error_code = ?3,
         error_message = ?4
     WHERE id = ?5
       AND claim_token = ?6
       AND status IN ('claimed', 'sending')`,
  ).bind(
    deps.now(),
    input.providerStatus ?? null,
    input.errorCode,
    input.errorMessage,
    run.id,
    run.claim_token,
  ).run()
  if (!result.meta?.changes)
    throw new Error(`Digest run ${run.id} could not record failure`)
  return {
    _tag: 'failed',
    deliveryKey: run.delivery_key,
    stage: input.stage,
    error: input.errorCode,
  }
}

async function markSkipped(
  deps: DigestDeliveryDependencies,
  run: DigestRunRow,
): Promise<DigestDeliveryResult> {
  const result = await deps.db.prepare(
    `UPDATE digest_runs
     SET status = 'skipped',
         claim_expires_at = NULL,
         finished_at = ?1
     WHERE id = ?2
       AND claim_token = ?3
       AND status = 'claimed'`,
  ).bind(deps.now(), run.id, run.claim_token).run()
  if (!result.meta?.changes)
    throw new Error(`Digest run ${run.id} could not record skip`)
  return { _tag: 'skipped', deliveryKey: run.delivery_key }
}

function summaryInput(selection: DigestSelection): DigestSummaryInput {
  return {
    subscriptions: selection.entries.map(entry => ({
      owner: entry.owner,
      repo: entry.repo,
      skills: entry.skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        changeCount: skill.changeCount,
      })),
    })),
    changes: selection.entries.map(entry => ({
      owner: entry.owner,
      repo: entry.repo,
      totalChangeCount: entry.changeCount,
      skills: entry.skills.map(skill => ({
        name: skill.name,
        changeCount: skill.changeCount,
        commitMessages: skill.commitMessages,
      })),
      diffExcerpt: '',
    })),
  }
}

function fallbackReason(summary: Extract<SummariseResult, { _tag: 'fallback' }>): string {
  return `${summary.reason}${summary.error ? `: ${summary.error}` : ''}`
}

async function transitionToSending(
  deps: DigestDeliveryDependencies,
  run: DigestRunRow,
  selection: DigestSelection,
  summary: SummariseResult,
): Promise<void> {
  const summarized = summary._tag === 'summarized'
  const result = await deps.db.prepare(
    `UPDATE digest_runs
     SET status = 'sending',
         claim_expires_at = NULL,
         sending_at = ?1,
         change_count = ?2,
         ai_summary_used = ?3,
         ai_fallback_reason = ?4,
         ai_input_tokens = ?5,
         ai_output_tokens = ?6
     WHERE id = ?7
       AND claim_token = ?8
       AND status = 'claimed'`,
  ).bind(
    deps.now(),
    selection.entries.reduce((sum, entry) => sum + entry.changeCount, 0),
    summarized && summary.summaries.length ? 1 : 0,
    summarized ? null : fallbackReason(summary),
    summarized ? summary.usage?.inputTokens ?? 0 : 0,
    summarized ? summary.usage?.outputTokens ?? 0 : 0,
    run.id,
    run.claim_token,
  ).run()
  if (!result.meta?.changes)
    throw new Error(`Digest run ${run.id} could not transition to sending`)
}

async function markSent(
  deps: DigestDeliveryDependencies,
  run: DigestRunRow,
  providerMessageId: string,
): Promise<void> {
  const sentAt = deps.now()
  const result = await deps.db.prepare(
    `UPDATE digest_runs
     SET status = 'sent',
         sent_at = ?1,
         finished_at = ?1,
         provider_message_id = ?2,
         provider_status = 'accepted'
     WHERE id = ?3
       AND claim_token = ?4
       AND status = 'sending'`,
  ).bind(sentAt, providerMessageId, run.id, run.claim_token).run()
  if (!result.meta?.changes)
    throw new Error(`Digest run ${run.id} could not record sent state`)
}

async function markUncertain(
  deps: DigestDeliveryDependencies,
  run: DigestRunRow,
  input:
    | {
      _tag: 'unknown'
      reason: 'provider_threw' | 'provider_uncertain'
      errorMessage: string
    }
    | {
      _tag: 'accepted_unpersisted'
      reason: 'provider_success_persistence_failed'
      providerMessageId: string
      errorMessage: string
    },
): Promise<DigestDeliveryResult> {
  const diagnostic = input.errorMessage.trim() || 'Provider outcome could not be confirmed'
  const providerMessageId = input._tag === 'accepted_unpersisted'
    ? input.providerMessageId
    : null
  const providerStatus = input._tag === 'accepted_unpersisted'
    ? 'accepted_unpersisted'
    : 'unknown'
  const errorCode = input._tag === 'accepted_unpersisted'
    ? 'sent_persistence_failed'
    : 'provider_outcome_unknown'
  const persistenceDescription = input._tag === 'accepted_unpersisted'
    ? 'accepted provider evidence'
    : 'unknown provider outcome'
  const persisted = await deps.db.prepare(
    `UPDATE digest_runs
     SET status = 'uncertain',
         finished_at = ?1,
         provider_message_id = ?2,
         provider_status = ?3,
         error_code = ?4,
         error_message = ?5
     WHERE id = ?6
       AND claim_token = ?7
       AND status = 'sending'`,
  ).bind(
    deps.now(),
    providerMessageId,
    providerStatus,
    errorCode,
    diagnostic,
    run.id,
    run.claim_token,
  ).run().then(
    result => ({ _tag: 'result' as const, changes: result.meta?.changes ?? 0 }),
    error => ({ _tag: 'failure' as const, error: errorMessage(error) }),
  )
  const persistenceError = persisted._tag === 'failure'
    ? persisted.error
    : persisted.changes
      ? null
      : `Digest run ${run.id} was no longer sending`
  return {
    _tag: 'delivery_uncertain',
    deliveryKey: run.delivery_key,
    reason: input.reason,
    error: persistenceError
      ? `${diagnostic}; could not persist ${persistenceDescription}: ${persistenceError}`
      : diagnostic,
  }
}

export async function runDigestDeliveryForUser(
  deps: DigestDeliveryDependencies,
  user: DigestUser,
  input: { scheduledAt: number, siteUrl: string },
): Promise<DigestDeliveryResult> {
  const claim = await claimDigestWindow(deps, user, input.scheduledAt)
  if (claim._tag !== 'acquired')
    return claim
  const run = claim.run

  const recipient = (user.digest_email || user.email || '').trim()
  if (!recipient) {
    return await markFailed(deps, run, {
      stage: 'preflight',
      errorCode: 'missing_recipient',
      errorMessage: 'Digest user has no deliverable email address',
    })
  }

  const selection = await deps.select(deps.db, user, run.window_end, {
    windowStart: run.window_start,
    cursorStart: run.cursor_start,
    cursorEnd: run.cursor_end,
  })
  if (!selection)
    throw new Error(`Digest selection returned no result for user ${user.id}`)
  if (!selection.entries.length)
    return await markSkipped(deps, run)

  const summary = await deps.summarise(summaryInput(selection)).then(
    result => result,
    error => ({
      _tag: 'fallback' as const,
      reason: 'provider_failure' as const,
      error: `unexpected summary failure: ${errorMessage(error)}`,
    }),
  )
  const summaries = new Map<string, string>()
  if (summary._tag === 'summarized') {
    for (const item of summary.summaries)
      summaries.set(`${item.owner}/${item.repo}`, item.sentence)
  }

  const unsubscribeToken = await deps.signUnsubscribe(user.id)
  const unsubscribeUrl = `${input.siteUrl}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken)}&list=digest`
  const rendered = deps.render({
    login: user.login,
    recipientName: user.name ?? null,
    userId: user.id,
    windowStart: selection.windowStart,
    windowEnd: selection.windowEnd,
    unsubscribeUrl,
    siteUrl: input.siteUrl,
    settingsUrl: `${input.siteUrl}/me`,
    entries: selection.entries.map(entry => ({
      owner: entry.owner,
      repo: entry.repo,
      skillNames: entry.skillNames,
      skills: entry.skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        changeCount: skill.changeCount,
        commitMessages: skill.commitMessages,
        changedAt: skill.changedAt,
        sourceUrl: skill.sourceUrl,
        changeUrl: skill.changeUrl,
      })),
      changeCount: entry.changeCount,
      summary: summaries.get(`${entry.owner}/${entry.repo}`) ?? null,
    })),
  })

  await transitionToSending(deps, run, selection, summary)
  const emailInput: SendEmailInput = {
    to: recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Campaign-ID': run.delivery_key,
    },
  }
  const attemptSend = () => deps.send(emailInput).then(
    result => ({ _tag: 'result' as const, result }),
    error => ({ _tag: 'throw' as const, error: errorMessage(error) }),
  )
  const firstAttempt = await attemptSend()
  // A rejected call is a definite no-send, so one immediate retry is safe and
  // heals a transient provider failure inside the same run. On the monthly
  // cron the next attempt would otherwise be a full cycle away. Unknown
  // outcomes (throw, uncertain) are never retried: the first call may have
  // delivered, and a retry would risk a duplicate email.
  const provider = firstAttempt._tag === 'result' && firstAttempt.result._tag === 'rejected'
    ? await attemptSend()
    : firstAttempt
  if (provider._tag === 'throw') {
    return await markUncertain(deps, run, {
      _tag: 'unknown',
      reason: 'provider_threw',
      errorMessage: provider.error,
    })
  }
  if (provider.result._tag === 'uncertain') {
    return await markUncertain(deps, run, {
      _tag: 'unknown',
      reason: 'provider_uncertain',
      errorMessage: provider.result.error,
    })
  }
  if (provider.result._tag === 'rejected') {
    return await markFailed(deps, run, {
      stage: 'provider',
      errorCode: 'provider_failure',
      errorMessage: provider.result.error,
      providerStatus: 'rejected',
    })
  }

  const providerMessageId = provider.result.messageId
  const persisted = await markSent(deps, run, providerMessageId).then(
    () => ({ _tag: 'persisted' as const }),
    error => ({ _tag: 'failure' as const, error: errorMessage(error) }),
  )
  if (persisted._tag === 'failure') {
    return await markUncertain(deps, run, {
      _tag: 'accepted_unpersisted',
      reason: 'provider_success_persistence_failed',
      providerMessageId,
      errorMessage: persisted.error,
    })
  }
  return {
    _tag: 'sent',
    deliveryKey: run.delivery_key,
    providerMessageId,
    aiFallbackReason: summary._tag === 'fallback' ? fallbackReason(summary) : null,
  }
}
