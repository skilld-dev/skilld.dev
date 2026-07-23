/// <reference types="@cloudflare/workers-types" />

import type { SyncRepoStats } from './sync-repo'

export type DiscoverySource = 'owned_scan' | 'github_search' | 'manual'

interface DiscoveredCandidateBase {
  owner: string
  repo: string
  discoveredAt: number
  ownerVerified: boolean
}

export type DiscoveredCandidate = DiscoveredCandidateBase & (
  | { source: 'manual', manualReconsideration: boolean }
  | { source: Exclude<DiscoverySource, 'manual'>, manualReconsideration?: false }
)

export type DiscoveryAttemptOutcome
  = | { _tag: 'indexed' }
    | { _tag: 'verified_only' }
    | { _tag: 'already_admitted' }
    | { _tag: 'rejected', reason: string }
    | { _tag: 'retryable_failure', error: string }

export interface ClaimDiscoveryCandidateInput {
  owner: string
  repo: string
  now: number
  staleBefore: number
  token: string
}

export type DiscoveryClaimUnavailable
  = | { _tag: 'active_claim' }
    | { _tag: 'not_due' }
    | { _tag: 'complete' }
    | { _tag: 'exhausted' }
    | { _tag: 'missing' }
    | { _tag: 'state_changed' }

export interface ClassifiedDiscoveryClaimUnavailable {
  _tag: DiscoveryClaimUnavailable['_tag']
  alertable: boolean
}

export type ClaimDiscoveryCandidateResult
  = | { _tag: 'claimed', attemptCount: number, ownerVerified: boolean }
    | DiscoveryClaimUnavailable

export interface FinishDiscoveryCandidateAttemptInput {
  owner: string
  repo: string
  token: string
  now: number
  outcome: DiscoveryAttemptOutcome
  maxAttempts?: number
}

interface ClaimedCandidateRow {
  attempt_count: number
  owner_verified: number
}

interface CandidateAvailabilityRow {
  retry_state: 'ready' | 'claimed' | 'retry_scheduled' | 'exhausted' | 'complete'
  next_retry_at: number | null
}

export function classifyDiscoveryClaimUnavailable(
  claim: DiscoveryClaimUnavailable,
): ClassifiedDiscoveryClaimUnavailable {
  return {
    _tag: claim._tag,
    alertable: claim._tag === 'missing' || claim._tag === 'state_changed',
  }
}

async function unavailableClaimResult(
  db: D1Database,
  input: ClaimDiscoveryCandidateInput,
): Promise<DiscoveryClaimUnavailable> {
  const row = await db.prepare(
    `SELECT retry_state, next_retry_at
     FROM discovery_candidates
     WHERE owner = ? AND repo = ?`,
  ).bind(input.owner, input.repo).first<CandidateAvailabilityRow>()

  if (!row)
    return { _tag: 'missing' }
  if (row.retry_state === 'claimed')
    return { _tag: 'active_claim' }
  if (row.retry_state === 'complete')
    return { _tag: 'complete' }
  if (row.retry_state === 'exhausted')
    return { _tag: 'exhausted' }
  if (row.retry_state === 'retry_scheduled' && row.next_retry_at != null && row.next_retry_at > input.now)
    return { _tag: 'not_due' }
  return { _tag: 'state_changed' }
}

export function discoveryOutcomeFromSyncStats(stats: SyncRepoStats): DiscoveryAttemptOutcome {
  if (stats.status === 'indexed' && stats.skillsUpserted > 0)
    return { _tag: 'indexed' }
  if (stats.status === 'verified-only')
    return { _tag: 'verified_only' }
  if (stats.status === 'skipped-pushed-at' || stats.status === 'skipped-tree-sha')
    return { _tag: 'already_admitted' }
  if (stats.status === 'rejected')
    return { _tag: 'rejected', reason: stats.reason ?? 'rejected_without_reason' }
  return {
    _tag: 'retryable_failure',
    error: stats.status === 'indexed'
      ? 'indexed_without_upsert'
      : stats.reason ?? `sync_${stats.status}`,
  }
}

export async function upsertDiscoveryCandidate(
  db: D1Database,
  candidate: DiscoveredCandidate,
): Promise<void> {
  await db.prepare(
    `INSERT INTO discovery_candidates (
       owner, repo, source, first_discovered_at, last_discovered_at,
       outcome, retry_state, owner_verified, reconsideration_count
     ) VALUES (?, ?, ?, ?, ?, 'pending', 'ready', ?, ?)
     ON CONFLICT(owner, repo) DO UPDATE SET
       source = excluded.source,
       last_discovered_at = MAX(discovery_candidates.last_discovered_at, excluded.last_discovered_at),
       last_attempted_at = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN discovery_candidates.last_attempted_at
         WHEN excluded.owner_verified > discovery_candidates.owner_verified
           OR excluded.reconsideration_count > 0 THEN NULL
         ELSE discovery_candidates.last_attempted_at
       END,
       attempt_count = CASE
         WHEN excluded.owner_verified > discovery_candidates.owner_verified
           OR excluded.reconsideration_count > 0 THEN 0
         ELSE discovery_candidates.attempt_count
       END,
       outcome = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN discovery_candidates.outcome
         WHEN excluded.owner_verified > discovery_candidates.owner_verified
           OR excluded.reconsideration_count > 0 THEN 'pending'
         ELSE discovery_candidates.outcome
       END,
       rejection_reason = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN discovery_candidates.rejection_reason
         WHEN excluded.owner_verified > discovery_candidates.owner_verified
           OR excluded.reconsideration_count > 0 THEN NULL
         ELSE discovery_candidates.rejection_reason
       END,
       last_error = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN discovery_candidates.last_error
         WHEN excluded.owner_verified > discovery_candidates.owner_verified
           OR excluded.reconsideration_count > 0 THEN NULL
         ELSE discovery_candidates.last_error
       END,
       retry_state = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN 'claimed'
         WHEN excluded.owner_verified > discovery_candidates.owner_verified
           OR excluded.reconsideration_count > 0 THEN 'ready'
         ELSE discovery_candidates.retry_state
       END,
       next_retry_at = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN discovery_candidates.next_retry_at
         WHEN excluded.owner_verified > discovery_candidates.owner_verified
           OR excluded.reconsideration_count > 0 THEN NULL
         ELSE discovery_candidates.next_retry_at
       END,
       owner_verified = MAX(discovery_candidates.owner_verified, excluded.owner_verified),
       reconsideration_count = discovery_candidates.reconsideration_count + excluded.reconsideration_count,
       claimed_at = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN discovery_candidates.claimed_at
         ELSE NULL
       END,
       claim_token = CASE
         WHEN discovery_candidates.retry_state = 'claimed' THEN discovery_candidates.claim_token
         ELSE NULL
       END`,
  ).bind(
    candidate.owner,
    candidate.repo,
    candidate.source,
    candidate.discoveredAt,
    candidate.discoveredAt,
    candidate.ownerVerified ? 1 : 0,
    candidate.manualReconsideration ? 1 : 0,
  ).run()
}

export async function claimDiscoveryCandidate(
  db: D1Database,
  input: ClaimDiscoveryCandidateInput,
): Promise<ClaimDiscoveryCandidateResult> {
  const result = await db.prepare(
    `UPDATE discovery_candidates
     SET last_attempted_at = ?,
         attempt_count = attempt_count + 1,
         outcome = 'pending',
         rejection_reason = NULL,
         last_error = NULL,
         retry_state = 'claimed',
         next_retry_at = NULL,
         claimed_at = ?,
         claim_token = ?
     WHERE owner = ? AND repo = ?
       AND (
         (retry_state IN ('ready', 'retry_scheduled') AND (next_retry_at IS NULL OR next_retry_at <= ?))
         OR (retry_state = 'claimed' AND claimed_at <= ?)
       )`,
  ).bind(
    input.now,
    input.now,
    input.token,
    input.owner,
    input.repo,
    input.now,
    input.staleBefore,
  ).run()

  if (!result.meta?.changes)
    return unavailableClaimResult(db, input)

  const row = await db.prepare(
    `SELECT attempt_count, owner_verified
     FROM discovery_candidates
     WHERE owner = ? AND repo = ? AND claim_token = ?`,
  ).bind(input.owner, input.repo, input.token).first<ClaimedCandidateRow>()

  if (!row)
    return unavailableClaimResult(db, input)

  return {
    _tag: 'claimed',
    attemptCount: row.attempt_count,
    ownerVerified: row.owner_verified === 1,
  }
}

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(24 * 3600, 3600 * 2 ** Math.max(0, attemptCount - 1))
}

export async function finishDiscoveryCandidateAttempt(
  db: D1Database,
  input: FinishDiscoveryCandidateAttemptInput,
): Promise<'recorded' | 'stale_claim'> {
  const maxAttempts = input.maxAttempts ?? 5
  const row = await db.prepare(
    `SELECT attempt_count, owner_verified
     FROM discovery_candidates
     WHERE owner = ? AND repo = ? AND claim_token = ? AND retry_state = 'claimed'`,
  ).bind(input.owner, input.repo, input.token).first<ClaimedCandidateRow>()

  if (!row)
    return 'stale_claim'

  const complete = input.outcome._tag === 'indexed'
    || input.outcome._tag === 'verified_only'
    || input.outcome._tag === 'already_admitted'
  const exhausted = !complete && row.attempt_count >= maxAttempts
  const rejectionReason = input.outcome._tag === 'rejected' ? input.outcome.reason : null
  const lastError = input.outcome._tag === 'retryable_failure' ? input.outcome.error : null
  const nextRetryAt = complete || exhausted
    ? null
    : input.now + retryDelaySeconds(row.attempt_count)

  const result = await db.prepare(
    `UPDATE discovery_candidates
     SET outcome = ?,
         rejection_reason = ?,
         last_error = ?,
         retry_state = ?,
         next_retry_at = ?,
         claimed_at = NULL,
         claim_token = NULL
     WHERE owner = ? AND repo = ? AND claim_token = ? AND retry_state = 'claimed'`,
  ).bind(
    input.outcome._tag,
    rejectionReason,
    lastError,
    complete ? 'complete' : exhausted ? 'exhausted' : 'retry_scheduled',
    nextRetryAt,
    input.owner,
    input.repo,
    input.token,
  ).run()

  return result.meta?.changes ? 'recorded' : 'stale_claim'
}
