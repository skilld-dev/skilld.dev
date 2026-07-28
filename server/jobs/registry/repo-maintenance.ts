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
import {
  refreshRepoAssets,
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
const SKILL_PATHS_PER_INVOCATION = 500

interface RepoProgressRow {
  job_id: string
  tree_sha: string | null
  checked_at: number
  next_offset: number
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
       owner, repo, job_id, tree_sha, checked_at, next_offset, updated_at
     ) VALUES (?, ?, ?, NULL, ?, 0, ?)
     ON CONFLICT(owner, repo) DO UPDATE SET
       job_id = excluded.job_id,
       tree_sha = NULL,
       checked_at = excluded.checked_at,
       next_offset = 0,
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
    `SELECT job_id, tree_sha, checked_at, next_offset
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
    now: number
  },
): Promise<void> {
  const result = await db.prepare(
    `UPDATE repo_sync_progress
     SET tree_sha = ?, checked_at = ?, next_offset = ?, updated_at = ?
     WHERE owner = ? AND repo = ? AND job_id = ?`,
  ).bind(
    input.treeSha,
    input.checkedAt,
    input.nextOffset,
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
     SET tree_sha = NULL, checked_at = ?, next_offset = 0, updated_at = ?
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

  const stats = await syncRepo(
    payload.owner,
    payload.repo,
    bindings,
    ctx.db,
    payload.operation === 'render'
      ? {
          forceContent: true,
          maxSkillFiles: SKILL_PATHS_PER_INVOCATION,
          ...(progress.row.tree_sha
            ? {
                continuation: {
                  treeSha: progress.row.tree_sha,
                  checkedAt: progress.row.checked_at,
                  nextOffset: progress.row.next_offset,
                },
              }
            : {}),
        }
      : {
          ownerVerified,
          maxSkillFiles: SKILL_PATHS_PER_INVOCATION,
          ...(progress.row.tree_sha
            ? {
                continuation: {
                  treeSha: progress.row.tree_sha,
                  checkedAt: progress.row.checked_at,
                  nextOffset: progress.row.next_offset,
                },
              }
            : {}),
        },
  )
  const retryAfter = await applyRateGuard(ctx.db, {
    owner: payload.owner,
    repo: payload.repo,
    now,
    remaining: stats.rateLimitRemaining,
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
    await saveRepoProgress(ctx.db, {
      owner: payload.owner,
      repo: payload.repo,
      jobId: ctx.jobId,
      treeSha: stats.continuation.treeSha,
      checkedAt: stats.continuation.checkedAt,
      nextOffset: stats.continuation.nextOffset,
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
  if (stats.status === 'failed')
    throw new Error(stats.reason ?? `sync failed: ${payload.owner}/${payload.repo}`)
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
