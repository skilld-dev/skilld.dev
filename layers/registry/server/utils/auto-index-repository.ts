/// <reference types="@cloudflare/workers-types" />

import type { H3Event } from 'h3'
import type { FixedWindowDecision } from './fixed-window-rate-limit'
import type { FetchOutcome, GithubBindings, RepoMeta, TreeResponse } from './github-client'
import { getHeader } from 'h3'
import { enqueueRegistryRepoJob } from '~~/server/utils/registry-jobs-runtime'
import { isRegistrySkillPath } from '#shared/skill-path'
import { runAfterResponse } from './after-response'
import { consumeFixedWindow } from './fixed-window-rate-limit'
import { getRepo, getTree, resolveGithubBindings } from './github-client'

/**
 * Calls one client may trigger per window, and calls the whole site may
 * trigger per window. The pair is what stops a crawler walking unknown
 * `/gh/:owner/:repo` URLs from turning page views into GitHub calls.
 */
export const AUTO_INDEX_WINDOW_SECONDS = 3600
export const AUTO_INDEX_CLIENT_LIMIT = 10
export const AUTO_INDEX_GLOBAL_LIMIT = 200

export type AutoIndexSkipReason
  = | 'already_indexed'
    | 'already_candidate'
    | 'already_queued'
    | 'client_rate_limited'
    | 'global_rate_limited'
    | 'repository_unavailable'
    | 'repository_private'
    | 'repository_is_fork'
    | 'tree_unavailable'
    | 'no_skill_files'

export type AutoIndexOutcome
  = | { _tag: 'queued', owner: string, repo: string, jobId: string }
    | { _tag: 'skipped', owner: string, repo: string, reason: AutoIndexSkipReason }
    | { _tag: 'failed', owner: string, repo: string, error: string }

export type RepositoryEligibility
  = | { _tag: 'eligible' }
    | { _tag: 'rejected', reason: Extract<AutoIndexSkipReason, 'repository_private' | 'repository_is_fork' | 'no_skill_files'> }

export interface RepositoryEligibilityInput {
  fork: boolean
  private: boolean
  skillFileCount: number
}

/**
 * The read-path guard, as data in and data out.
 *
 * Only a public, non-fork repository that already carries a `SKILL.md` is
 * worth a queue write. A fork duplicates skills the upstream repository
 * already publishes, and a private repository cannot be delivered at all.
 */
export function decideRepositoryEligibility(input: RepositoryEligibilityInput): RepositoryEligibility {
  if (input.private)
    return { _tag: 'rejected', reason: 'repository_private' }
  if (input.fork)
    return { _tag: 'rejected', reason: 'repository_is_fork' }
  if (input.skillFileCount < 1)
    return { _tag: 'rejected', reason: 'no_skill_files' }
  return { _tag: 'eligible' }
}

/** Registry Skill files in a Git tree listing. Test fixtures do not count. */
export function countSkillFiles(tree: TreeResponse): number {
  return tree.tree.filter(
    entry => entry.type === 'blob' && isRegistrySkillPath(entry.path),
  ).length
}

export type AutoIndexBlocker = Extract<
  AutoIndexSkipReason,
  'already_indexed' | 'already_candidate'
>

/**
 * A repository the registry has already recorded, under any entry path.
 *
 * Both lookups bind lower-cased identifiers, which is how every other registry
 * read addresses these tables. A row written under different casing still
 * cannot produce duplicate work: the submission job is unique on the
 * lower-cased `owner/repo`, so {@link enqueueRegistryRepoJob} reports it as a
 * duplicate instead of queueing a second one.
 */
export async function findAutoIndexBlocker(
  db: D1Database,
  repository: { owner: string, repo: string },
): Promise<AutoIndexBlocker | null> {
  const owner = repository.owner.toLowerCase()
  const repo = repository.repo.toLowerCase()
  // A repository whose every Skill row is `path_missing` had a readable tree
  // with zero Skills. The sync sweeps skip it, so a page view is the only thing
  // that notices a Skill added back. It is re-checked like an unknown
  // repository, behind the same limiter. The discovery ledger is not consulted:
  // its row for this repository is long settled.
  const indexed = await db.prepare(
    `SELECT
       EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo) AS has_rows,
       EXISTS (
         SELECT 1 FROM skills s
         WHERE s.owner = r.owner AND s.repo = r.repo
           AND COALESCE(s.sync_status, '') != 'path_missing'
       ) AS has_live_rows
     FROM repos r WHERE r.owner = ? AND r.repo = ? LIMIT 1`,
  ).bind(owner, repo).first<{ has_rows: number, has_live_rows: number }>()
  if (indexed)
    return indexed.has_rows === 1 && indexed.has_live_rows === 0 ? null : 'already_indexed'

  const candidate = await db.prepare(
    `SELECT 1 AS found FROM discovery_candidates WHERE owner = ? AND repo = ? LIMIT 1`,
  ).bind(owner, repo).first<{ found: number }>()
  return candidate ? 'already_candidate' : null
}

export interface AutoIndexDependencies {
  db: D1Database
  env: Cloudflare.Env & Record<string, unknown>
  /** Stable, opaque identity for the caller. Never a raw address. */
  clientBucket: string
  now: number
  getRepo: (owner: string, repo: string, bindings: GithubBindings) => Promise<FetchOutcome<RepoMeta>>
  getTree: (owner: string, repo: string, ref: string, bindings: GithubBindings) => Promise<FetchOutcome<TreeResponse>>
  resolveGithubBindings: (env: Cloudflare.Env) => GithubBindings
  enqueue: typeof enqueueRegistryRepoJob
  consumeRateLimit: (
    db: D1Database,
    request: { bucket: string, limit: number, windowSeconds: number, now: number },
  ) => Promise<FixedWindowDecision>
}

/**
 * Queue the `submit` job `POST /api/repos` queues, for a repository a read
 * path just asked for and the registry does not know.
 *
 * Order matters: the two free database lookups run before the rate limiter,
 * and the rate limiter runs before any GitHub call. A repository the registry
 * already knows therefore costs nothing and never spends limiter budget.
 */
export async function autoIndexMissingRepository(
  deps: AutoIndexDependencies,
  repository: { owner: string, repo: string },
): Promise<AutoIndexOutcome> {
  const { owner, repo } = repository
  const blocker = await findAutoIndexBlocker(deps.db, repository)
  if (blocker)
    return { _tag: 'skipped', owner, repo, reason: blocker }

  const client = await deps.consumeRateLimit(deps.db, {
    bucket: `client:${deps.clientBucket}`,
    limit: AUTO_INDEX_CLIENT_LIMIT,
    windowSeconds: AUTO_INDEX_WINDOW_SECONDS,
    now: deps.now,
  })
  if (client._tag === 'limited')
    return { _tag: 'skipped', owner, repo, reason: 'client_rate_limited' }

  const global = await deps.consumeRateLimit(deps.db, {
    bucket: 'global',
    limit: AUTO_INDEX_GLOBAL_LIMIT,
    windowSeconds: AUTO_INDEX_WINDOW_SECONDS,
    now: deps.now,
  })
  if (global._tag === 'limited')
    return { _tag: 'skipped', owner, repo, reason: 'global_rate_limited' }

  const bindings = deps.resolveGithubBindings(deps.env)
  const repoRes = await deps.getRepo(owner, repo, bindings)
  if (!repoRes.data)
    return { _tag: 'skipped', owner, repo, reason: 'repository_unavailable' }

  const meta = repoRes.data
  const treeRes = await deps.getTree(meta.owner.login, meta.name, meta.default_branch, bindings)
  if (!treeRes.data)
    return { _tag: 'skipped', owner, repo, reason: 'tree_unavailable' }
  // GitHub cuts large listings short. Trusting the partial listing would read
  // a skill-carrying repository as empty, or queue a submit job that fails
  // non-retryably at the same check, so an uncountable tree is no tree.
  if (treeRes.data.truncated === true)
    return { _tag: 'skipped', owner, repo, reason: 'tree_unavailable' }

  const eligibility = decideRepositoryEligibility({
    fork: meta.fork === true,
    private: meta.private === true,
    skillFileCount: countSkillFiles(treeRes.data),
  })
  if (eligibility._tag === 'rejected')
    return { _tag: 'skipped', owner, repo, reason: eligibility.reason }

  // Every registry entry path keys repositories lower-cased, so the queue
  // payload must too: a canonical-cased payload writes rows no read finds and
  // the trigger re-fires on every view.
  const queued = await deps.enqueue(deps.env, {
    operation: 'submit',
    owner: meta.owner.login.toLowerCase(),
    repo: meta.name.toLowerCase(),
  })
  return queued.status === 'duplicate'
    ? { _tag: 'skipped', owner, repo, reason: 'already_queued' }
    : { _tag: 'queued', owner, repo, jobId: queued.jobId }
}

/**
 * An opaque per-caller identity for the limiter.
 *
 * The address itself is never stored. A truncated digest keeps distinct
 * callers apart for the window's lifetime and nothing else.
 */
export async function clientRateLimitBucket(event: H3Event): Promise<string> {
  const address = getHeader(event, 'cf-connecting-ip')
    ?? getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address))
  return [...new Uint8Array(digest).slice(0, 8)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Run the trigger after the response it rides on.
 *
 * The caller gets today's answer at today's speed. A failure here is logged as
 * a wide event and never reaches the request.
 */
export function scheduleAutoIndexMissingRepository(
  event: H3Event,
  repository: { owner: string, repo: string },
): void {
  const platform = event.context.platform
  if (!platform)
    return
  runAfterResponse(event, autoIndexAndReport(event, platform.db, platform.env, repository))
}

async function autoIndexAndReport(
  event: H3Event,
  db: D1Database,
  env: Cloudflare.Env,
  repository: { owner: string, repo: string },
): Promise<void> {
  const outcome = await runAutoIndex(event, db, env, repository)
  emitOperationalEvent(
    createWideEvent({
      'operation': 'auto-index-repository',
      'outcome': outcome._tag,
      'repo': `${outcome.owner}/${outcome.repo}`,
      'reason': outcome._tag === 'skipped'
        ? outcome.reason
        : outcome._tag === 'failed' ? outcome.error : null,
      'error.count': outcome._tag === 'failed' ? 1 : 0,
    }),
    outcome._tag === 'failed' ? 'error' : 'info',
  )
}

async function runAutoIndex(
  event: H3Event,
  db: D1Database,
  env: Cloudflare.Env,
  repository: { owner: string, repo: string },
): Promise<AutoIndexOutcome> {
  try {
    return await autoIndexMissingRepository({
      db,
      env: env as Cloudflare.Env & Record<string, unknown>,
      clientBucket: await clientRateLimitBucket(event),
      now: Math.floor(Date.now() / 1000),
      getRepo,
      getTree,
      resolveGithubBindings,
      enqueue: enqueueRegistryRepoJob,
      consumeRateLimit: consumeFixedWindow,
    }, repository)
  }
  catch (error) {
    return {
      _tag: 'failed',
      owner: repository.owner,
      repo: repository.repo,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
