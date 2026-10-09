/// <reference types="@cloudflare/workers-types" />

import type { GithubBindings, RepoSummary } from './github-client'
import type { ExistingRepo } from './sync-repo'
import { getRepoSummariesBatch } from './github-client'
import { resolveRepoSourceIdentityFromRow } from './repo-source-identity'
import { sameRepositoryName } from './repository-move'
import { repositoryIdentityFailure, repoUnchangedStatements, unchangedRepoStatus } from './sync-repo'

/** One repository the hourly sync is about to queue. */
export interface SyncCandidate {
  owner: string
  repo: string
  ownerVerified: boolean
  claimDiscovery: boolean
}

export type SyncPrefetchResult
  = | {
    _tag: 'prefetched'
    /** Candidates that still need a sync job. */
    queue: SyncCandidate[]
    /** Repositories recorded as unchanged without a job. */
    unchanged: number
    /** GraphQL requests the prefetch sent. */
    requests: number
  }
  | {
    _tag: 'unread'
    /** Every candidate: the per-repository sync reads each one itself. */
    queue: SyncCandidate[]
    reason: string
  }

export interface SyncPrefetchDependencies {
  db: D1Database
  bindings: GithubBindings
  /** Unix seconds. */
  now: number
}

/** A sync job that touched its progress row this recently may still hold it. */
const PROGRESS_ACTIVE_SECONDS = 30 * 60

/** Repositories whose unchanged writes share one D1 batch. */
const WRITE_BATCH_REPOSITORIES = 25

interface PrefetchRow extends ExistingRepo {
  owner: string
  repo: string
  has_skills: number
  in_progress: number
}

/**
 * Read every eligible candidate's summary in batched GraphQL queries, record
 * the unchanged ones in place, and return the candidates that still need a job.
 *
 * Each candidate used to get a queue job whose first act was one GraphQL
 * summary read. On 2026-10-06, 1,649 of 1,900 such jobs wrote no Skill row.
 * A job that finds its tree unchanged only advances the freshness cursor, and
 * the writes here are the same statements `syncRepo` runs on that path.
 *
 * A discovery claim, a job still holding the repository's progress row, a
 * Skill-less repository, a repository GitHub moved to another name, and any
 * repository GitHub gave no summary for keep their job: `syncRepo` owns those
 * verdicts, the move included (ADR-0015).
 */
export async function prefetchUnchangedRepos(
  dependencies: SyncPrefetchDependencies,
  candidates: SyncCandidate[],
): Promise<SyncPrefetchResult> {
  const eligible = candidates.filter(candidate => !candidate.claimDiscovery)
  if (eligible.length === 0)
    return { _tag: 'prefetched', queue: candidates, unchanged: 0, requests: 0 }

  const rows = await loadPrefetchRows(dependencies.db, eligible, dependencies.now)
  const requests = eligible.map(candidate => resolveRepoSourceIdentityFromRow(candidate, rows.get(repoKey(candidate))))
  const batch = await getRepoSummariesBatch(requests, dependencies.bindings)
  if (batch._tag === 'failed')
    return { _tag: 'unread', queue: candidates, reason: `graphql-${batch.status}` }

  const unchanged = new Set<string>()
  const writes: D1PreparedStatement[][] = []
  eligible.forEach((candidate, index) => {
    const row = rows.get(repoKey(candidate))
    const summary = batch.summaries[index]
    if (!row || !summary || row.in_progress === 1 || repositoryIdentityFailure(row, candidate, summary.repositoryId) || isMoved(candidate, summary) || !isUnchanged(row, summary))
      return
    unchanged.add(repoKey(candidate))
    writes.push(repoUnchangedStatements(dependencies.db, {
      owner: candidate.owner,
      repo: candidate.repo,
      meta: summary.meta,
      repositoryId: summary.repositoryId,
      checkedAt: dependencies.now,
      ownerVerified: candidate.ownerVerified,
    }))
  })
  for (let offset = 0; offset < writes.length; offset += WRITE_BATCH_REPOSITORIES)
    await dependencies.db.batch(writes.slice(offset, offset + WRITE_BATCH_REPOSITORIES).flat())

  return {
    _tag: 'prefetched',
    queue: candidates.filter(candidate => !unchanged.has(repoKey(candidate))),
    unchanged: unchanged.size,
    requests: batch.requests,
  }
}

function isMoved(candidate: SyncCandidate, summary: RepoSummary): boolean {
  return !sameRepositoryName(candidate, { owner: summary.meta.owner.login, repo: summary.meta.name })
}

function isUnchanged(row: PrefetchRow, summary: RepoSummary): boolean {
  const pushedAt = Date.parse(summary.meta.pushed_at)
  return unchangedRepoStatus({
    existing: row,
    hasAdmittedSkills: row.has_skills === 1,
    headTreeSha: summary.headTreeSha,
    repoPushedAt: Number.isFinite(pushedAt) ? Math.floor(pushedAt / 1000) : null,
  }) !== null
}

function repoKey(identity: { owner: string, repo: string }): string {
  return `${identity.owner}/${identity.repo}`
}

/** One D1 read for every candidate: a JSON array binds as a single parameter. */
async function loadPrefetchRows(
  db: D1Database,
  candidates: SyncCandidate[],
  now: number,
): Promise<Map<string, PrefetchRow>> {
  const pairs = JSON.stringify(candidates.map(candidate => [candidate.owner, candidate.repo]))
  const result = await db.prepare(
    `WITH candidates(owner, repo) AS (
       SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]')
       FROM json_each(?1)
     )
     SELECT r.owner, r.repo, r.repository_id, r.last_tree_sha, r.pushed_at, r.source_owner, r.source_repo,
            EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo) AS has_skills,
            EXISTS (
              SELECT 1 FROM repo_sync_progress p
              WHERE p.owner = r.owner AND p.repo = r.repo AND p.updated_at > ?2
            ) AS in_progress
     FROM candidates c
     JOIN repos r ON r.owner = c.owner AND r.repo = c.repo`,
  ).bind(pairs, now - PROGRESS_ACTIVE_SECONDS).all<PrefetchRow>()
  return new Map((result.results ?? []).map(row => [repoKey(row), row]))
}
