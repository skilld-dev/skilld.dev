/// <reference types="@cloudflare/workers-types" />

import type { JobContext } from '#cf-jobs/server'
import { z } from 'zod'
import {
  claimDiscoveryCandidate,
  discoveryOutcomeFromSyncStats,
  finishDiscoveryCandidateAttempt,
} from '../../../layers/registry/server/utils/discovery-candidates'
import { resolveGithubBindings } from '../../../layers/registry/server/utils/github-client'
import {
  githubSyncPauseDecision,
  githubSyncPermit,
  pauseGithubSync,
} from '../../../layers/registry/server/utils/github-sync-control'
import { REPOSITORY_PURPOSE_MODEL, repositoryPurposeQuestions } from '../../../layers/registry/server/utils/repository-purpose'
import { checkRepositoryPurposeAdmission, readRepositoryPurposeEvidence, refreshRepositoryPurpose } from '../../../layers/registry/server/utils/repository-purpose-effect'
import {
  refreshRepoAssets,
  SKILL_SLICE_SIZE,
  syncRepo,
} from '../../../layers/registry/server/utils/sync-repo'

const repoIdentity = {
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
}

export const registryRepoJobInput = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('sync'),
    ...repoIdentity,
    ownerVerified: z.boolean(),
    claimDiscovery: z.boolean(),
  }),
  z.object({
    operation: z.literal('submit'),
    ...repoIdentity,
  }),
  z.object({
    operation: z.literal('render'),
    ...repoIdentity,
  }),
  z.object({
    operation: z.literal('assets'),
    ...repoIdentity,
  }),
])

export type RegistryRepoJob = z.infer<typeof registryRepoJobInput>
type RegistryJobEnv = Cloudflare.Env & Record<string, unknown>
type RegistryJobContext = JobContext<RegistryJobEnv, D1Database, Console>

const DISCOVERY_CLAIM_STALE_SECONDS = 30 * 60
const REPO_PROGRESS_STALE_SECONDS = 30 * 60

/**
 * Skill files one invocation works through before it hands back to the queue.
 *
 * This is not the memory bound. `syncRepo` walks its chunk in `SKILL_SLICE_SIZE`
 * slices and releases each slice's content before the next, so the working set
 * is set by that constant and does not grow with this one. Only the repo-wide
 * tree listing and existing-skill map are held across slices, and both are paid
 * once per invocation whatever this is.
 *
 * It used to be pinned to `SKILL_SLICE_SIZE`, which made every 50 files cost a
 * queue delivery. Five slices per invocation cuts the deliveries a large
 * repository needs by five, at five GraphQL round trips per invocation instead
 * of one.
 */
const SKILL_PATHS_PER_INVOCATION = 5 * SKILL_SLICE_SIZE

/**
 * Skill files this pipeline will index for one repository.
 *
 * The chain length is bounded by the queue's `max_retries`, because a
 * continuation releases the message and Cloudflare counts that as a delivery.
 * At `max_retries: 100` and 250 files per invocation the real ceiling is 25,250.
 * This sits under it so a repository that cannot finish is rejected by name
 * instead of dead-lettering silently on every hourly tick, which is what six
 * repositories did from 2026-08-12 to 2026-08-16.
 */
const MAX_INDEXABLE_SKILL_FILES = 20_000

interface RepoProgressRow {
  job_id: string
  tree_sha: string | null
  checked_at: number
  next_offset: number
  total_skills: number | null
}

type RepoProgressClaim
  = | { _tag: 'claimed', row: RepoProgressRow }
    | { _tag: 'busy' }

async function claimRepoProgress(
  db: D1Database,
  input: {
    owner: string
    repo: string
    jobId: string
    now: number
  },
): Promise<RepoProgressClaim> {
  await db.prepare(
    `INSERT INTO repo_sync_progress (
       owner, repo, job_id, tree_sha, checked_at, next_offset, total_skills, updated_at
     ) VALUES (?, ?, ?, NULL, ?, 0, NULL, ?)
     ON CONFLICT(owner, repo) DO UPDATE SET
       job_id = excluded.job_id,
       tree_sha = NULL,
       checked_at = excluded.checked_at,
       next_offset = 0,
       total_skills = NULL,
       updated_at = excluded.updated_at
     WHERE repo_sync_progress.updated_at <= ?`,
  ).bind(
    input.owner,
    input.repo,
    input.jobId,
    input.now,
    input.now,
    input.now - REPO_PROGRESS_STALE_SECONDS,
  ).run()
  const row = await db.prepare(
    `SELECT job_id, tree_sha, checked_at, next_offset, total_skills
     FROM repo_sync_progress
     WHERE owner = ? AND repo = ?`,
  ).bind(input.owner, input.repo).first<RepoProgressRow>()
  return row?.job_id === input.jobId
    ? { _tag: 'claimed', row }
    : { _tag: 'busy' }
}

async function saveRepoProgress(
  db: D1Database,
  input: {
    owner: string
    repo: string
    jobId: string
    treeSha: string
    checkedAt: number
    nextOffset: number
    totalSkills: number
    now: number
  },
): Promise<void> {
  const result = await db.prepare(
    `UPDATE repo_sync_progress
     SET tree_sha = ?, checked_at = ?, next_offset = ?, total_skills = ?, updated_at = ?
     WHERE owner = ? AND repo = ? AND job_id = ?`,
  ).bind(
    input.treeSha,
    input.checkedAt,
    input.nextOffset,
    input.totalSkills,
    input.now,
    input.owner,
    input.repo,
    input.jobId,
  ).run()
  if (Number(result.meta.changes ?? 0) !== 1)
    throw new Error(`repo progress ownership lost: ${input.owner}/${input.repo}`)
}

async function resetRepoProgress(
  db: D1Database,
  input: { owner: string, repo: string, jobId: string, now: number },
): Promise<void> {
  await db.prepare(
    `UPDATE repo_sync_progress
     SET tree_sha = NULL, checked_at = ?, next_offset = 0, total_skills = NULL, updated_at = ?
     WHERE owner = ? AND repo = ? AND job_id = ?`,
  ).bind(input.now, input.now, input.owner, input.repo, input.jobId).run()
}

async function clearRepoProgress(
  db: D1Database,
  input: { owner: string, repo: string, jobId: string },
): Promise<void> {
  await db.prepare(
    `DELETE FROM repo_sync_progress
     WHERE owner = ? AND repo = ? AND job_id = ?`,
  ).bind(input.owner, input.repo, input.jobId).run()
}

async function applyRateGuard(
  db: D1Database,
  input: {
    owner: string
    repo: string
    now: number
    remaining?: number
    resource?: string
    resetAt?: number
    rateLimited: boolean
    unauthorized: boolean
  },
): Promise<number | null> {
  const decision = githubSyncPauseDecision(input)
  if (decision._tag === 'continue')
    return null
  await pauseGithubSync(db, {
    pauseUntil: decision.pauseUntil,
    reason: decision.reason,
    now: input.now,
  })
  return Math.max(60, decision.pauseUntil - input.now + 5)
}

export async function handleRegistryRepoJob(
  payload: RegistryRepoJob,
  ctx: RegistryJobContext,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const permit = await githubSyncPermit(ctx.db, now)
  if (permit._tag === 'paused') {
    await ctx.release(permit.retryAfterSeconds)
    return
  }

  const bindings = resolveGithubBindings(ctx.env)
  if (payload.operation === 'assets') {
    const result = await refreshRepoAssets(payload.owner, payload.repo, bindings, ctx.db)
    const retryAfter = await applyRateGuard(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      now,
      remaining: result.rateLimitRemaining,
      resetAt: result.rateLimitResetAt,
      rateLimited: result._tag === 'failed' && result.rateLimited,
      unauthorized: result._tag === 'failed' && result.unauthorized,
    })
    if (result._tag === 'failed') {
      if (retryAfter != null) {
        await ctx.release(retryAfter)
        return
      }
      if (result.retryable)
        throw new Error(result.reason)
      await ctx.fail(result.reason)
      return
    }
    ctx.reportStats?.({
      rowsFetched: result.skillsSeen,
      rowsInserted: result.skillsChanged,
    })
    return
  }

  const progress = await claimRepoProgress(ctx.db, {
    owner: payload.owner,
    repo: payload.repo,
    jobId: ctx.jobId,
    now,
  })
  if (progress._tag === 'busy') {
    await ctx.release(60)
    return
  }

  let discoveryClaimed = false
  let ownerVerified = payload.operation === 'sync' ? payload.ownerVerified : false
  if (payload.operation === 'sync' && payload.claimDiscovery) {
    const claim = await claimDiscoveryCandidate(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      now,
      staleBefore: now - DISCOVERY_CLAIM_STALE_SECONDS,
      token: ctx.jobId,
    })
    if (claim._tag === 'active_claim') {
      await clearRepoProgress(ctx.db, {
        owner: payload.owner,
        repo: payload.repo,
        jobId: ctx.jobId,
      })
      await ctx.release(60)
      return
    }
    if (claim._tag === 'complete' || claim._tag === 'exhausted' || claim._tag === 'not_due') {
      await clearRepoProgress(ctx.db, {
        owner: payload.owner,
        repo: payload.repo,
        jobId: ctx.jobId,
      })
      return
    }
    if (claim._tag === 'missing' || claim._tag === 'state_changed') {
      await clearRepoProgress(ctx.db, {
        owner: payload.owner,
        repo: payload.repo,
        jobId: ctx.jobId,
      })
      throw new Error(`discovery claim ${claim._tag}: ${payload.owner}/${payload.repo}`)
    }
    discoveryClaimed = true
    ownerVerified = claim.ownerVerified
  }

  // Existing rows and named admission decisions retain source recovery.
  // Only new submissions and discovery claims need this purpose gate.
  if (!progress.row.tree_sha && (payload.operation === 'submit' || discoveryClaimed)) {
    const purpose = await checkRepositoryPurposeAdmission(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      ownerVerified,
    }, () => {
      if (!ctx.env.AI)
        throw new Error('Repository purpose AI binding is missing.')
      return refreshRepositoryPurpose({
        db: ctx.db,
        readEvidence: (input, repositoryId) => readRepositoryPurposeEvidence(input, bindings, repositoryId),
        judge: state => ctx.env.AI.run(REPOSITORY_PURPOSE_MODEL, { state, questions: repositoryPurposeQuestions }),
      }, payload, now)
    })
    if (purpose._tag === 'held') {
      if (discoveryClaimed) {
        await finishDiscoveryCandidateAttempt(ctx.db, {
          owner: payload.owner,
          repo: payload.repo,
          token: ctx.jobId,
          now,
          outcome: { _tag: 'rejected', reason: purpose.reason },
        })
      }
      await clearRepoProgress(ctx.db, { owner: payload.owner, repo: payload.repo, jobId: ctx.jobId })
      await ctx.fail(purpose.reason)
      return
    }
  }

  const continuation = progress.row.tree_sha
    ? {
        continuation: {
          treeSha: progress.row.tree_sha,
          checkedAt: progress.row.checked_at,
          nextOffset: progress.row.next_offset,
        },
      }
    : {}
  const stats = await syncRepo(
    payload.owner,
    payload.repo,
    bindings,
    ctx.db,
    payload.operation === 'render'
      ? {
          forceContent: true,
          maxSkillFiles: SKILL_PATHS_PER_INVOCATION,
          ...continuation,
        }
      : payload.operation === 'submit'
        ? {
            submitted: true,
            maxSkillFiles: SKILL_PATHS_PER_INVOCATION,
            ...continuation,
          }
        : {
            ownerVerified,
            maxSkillFiles: SKILL_PATHS_PER_INVOCATION,
            ...continuation,
          },
  )
  const retryAfter = await applyRateGuard(ctx.db, {
    owner: payload.owner,
    repo: payload.repo,
    now,
    remaining: stats.rateLimitRemaining,
    resource: stats.rateLimitResource,
    resetAt: stats.rateLimitResetAt,
    rateLimited: stats.status === 'rate-limited',
    unauthorized: stats.status === 'unauthorized',
  })
  if (retryAfter != null) {
    await ctx.release(retryAfter)
    return
  }
  if (stats.status === 'restart-required') {
    await resetRepoProgress(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      jobId: ctx.jobId,
      now: Math.floor(Date.now() / 1000),
    })
    await ctx.release(1)
    return
  }
  if (stats.status === 'continuing') {
    if (!stats.continuation)
      throw new Error(`sync continuation missing: ${payload.owner}/${payload.repo}`)
    if (stats.continuation.nextOffset >= MAX_INDEXABLE_SKILL_FILES) {
      await clearRepoProgress(ctx.db, {
        owner: payload.owner,
        repo: payload.repo,
        jobId: ctx.jobId,
      })
      if (discoveryClaimed) {
        await finishDiscoveryCandidateAttempt(ctx.db, {
          owner: payload.owner,
          repo: payload.repo,
          token: ctx.jobId,
          now: Math.floor(Date.now() / 1000),
          outcome: { _tag: 'rejected', reason: 'repo_too_large_to_index' },
        })
      }
      await ctx.fail('repo_too_large_to_index')
      return
    }
    await saveRepoProgress(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      jobId: ctx.jobId,
      treeSha: stats.continuation.treeSha,
      checkedAt: stats.continuation.checkedAt,
      nextOffset: stats.continuation.nextOffset,
      totalSkills: stats.skillsSeen,
      now: Math.floor(Date.now() / 1000),
    })
    ctx.reportStats?.({
      rowsFetched: stats.skillsSeen,
      rowsInserted: stats.skillsUpserted,
    })
    await ctx.release(1)
    return
  }

  if (discoveryClaimed) {
    const finish = await finishDiscoveryCandidateAttempt(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      token: ctx.jobId,
      now: Math.floor(Date.now() / 1000),
      outcome: discoveryOutcomeFromSyncStats(stats),
    })
    if (finish === 'stale_claim') {
      await clearRepoProgress(ctx.db, {
        owner: payload.owner,
        repo: payload.repo,
        jobId: ctx.jobId,
      })
      throw new Error(`discovery claim expired: ${payload.owner}/${payload.repo}`)
    }
  }
  if (stats.status !== 'failed') {
    await clearRepoProgress(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      jobId: ctx.jobId,
    })
  }

  ctx.reportStats?.({
    rowsFetched: stats.skillsSeen,
    rowsInserted: stats.skillsUpserted,
  })
  if (stats.status === 'failed') {
    if (isPermanentRepoFailure(stats.reason)) {
      await clearRepoProgress(ctx.db, {
        owner: payload.owner,
        repo: payload.repo,
        jobId: ctx.jobId,
      })
      await ctx.fail(stats.reason ?? 'repository_index_failed')
      return
    }
    else {
      throw new Error(stats.reason ?? `sync failed: ${payload.owner}/${payload.repo}`)
    }
  }
  if (payload.operation === 'submit' && stats.status === 'rejected') {
    await ctx.fail(stats.reason ?? 'repository_index_rejected')
    return
  }
  if (stats.status === 'unauthorized') {
    await ctx.fail(stats.reason ?? 'GitHub credential rejected')
  }
}

export default defineJob({
  name: 'registry/repo-maintenance',
  queue: 'repo-sync',
  input: registryRepoJobInput,
  tries: 5,
  backoff: [60, 300, 900, 3600],
  handle: handleRegistryRepoJob,
})

/**
 * Failures that describe the repository, not the attempt.
 *
 * Every reason here is a verdict GitHub or the size guard already reached, so a
 * retry pays five GitHub round trips across a 60/300/900/3600 backoff to learn
 * the same thing. Failing once by name ends the job on the first answer.
 *
 * This used to be gated on `operation === 'submit'`, which left the far more
 * common `sync` path throwing. That cost twice over. The retries were wasted,
 * and a throw stringifies to `Error: repo fetch 404` plus a stack, so it never
 * matched `TERMINAL_DISCOVERY_REJECTION_REASONS`, which compares the exception
 * for equality against the bare reason. `ctx.fail` writes the reason verbatim,
 * so a decision now reads as a decision. Measured on 2026-08-19: the two
 * `repo fetch 404` rows for `chadking-agent/sia` and
 * `chloevpin/x-for-you-feed-skill` were the entire content of the operator
 * report's `2 jobs failed in 24 hours.` RED reason, and both repositories had
 * simply been deleted.
 *
 * `syncRepo` already calls `markRepoMissing` for 404 and 410, so the registry
 * was correct throughout. Only the job outcome was wrong.
 */
function isPermanentRepoFailure(reason: string | undefined): boolean {
  return reason === 'repo fetch 404'
    || reason === 'repo fetch 410'
    || reason === 'tree_truncated'
    || reason === 'repo_too_large_to_index'
    || reason?.startsWith('move_refused:') === true
    || reason?.startsWith('skill_parse_rejected:') === true
}
