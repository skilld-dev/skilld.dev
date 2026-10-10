/// <reference types="@cloudflare/workers-types" />

import type { GithubBindings } from '#layers/registry/server/utils/github-client'
import type { SyncRepoOptions, SyncRepoStats } from '#layers/registry/server/utils/sync-repo'
import {
  claimDiscoveryCandidate,
  discoveryOutcomeFromSyncStats,
  finishDiscoveryCandidateAttempt,
  upsertDiscoveryCandidate,
} from '#layers/registry/server/utils/discovery-candidates'
import { resolveGithubBindings } from '#layers/registry/server/utils/github-client'
import { syncRepo } from '#layers/registry/server/utils/sync-repo'
import { isRegistrySkillPath } from '#shared/skill-path'

interface CodeSearchItem {
  path: string
  repository: { name: string, owner: { login: string }, fork: boolean }
}

interface CodeSearchResponse {
  total_count: number
  incomplete_results: boolean
  items: CodeSearchItem[]
}

interface ScanCounts {
  hits: number
  ownersScanned: number
  orgsScanned: number
  orgLookupError: string | null
  reposFound: number
  reposSynced: number
  reposVerifiedOnly: number
  reposRejected: number
  reposFailed: number
  reposClaimedElsewhere: number
  reposAlreadyProcessed: number
  reposExhausted: number
  reposDeferred: number
  reposCandidateMissing: number
  reposCandidateStateFailed: number
}

export type ScanResult
  = | ({ _tag: 'complete' } & ScanCounts)
    | ({ _tag: 'partial', reason: 'incomplete_results' | 'result_cap' | 'candidate_state_failure' } & ScanCounts)
    | ({ _tag: 'auth_failure', status: 401 } & ScanCounts)
    | ({
      _tag: 'rate_limited'
      status: 403 | 429
      rateLimitRemaining: number | null
      rateLimitReset: number | null
      requestId: string | null
    } & ScanCounts)
    | ({ _tag: 'provider_failure', status: number | null, error: string } & ScanCounts)

interface ScanOwnedReposInput {
  login: string
  userToken: string
  db: D1Database
  env: Cloudflare.Env
}

interface ScanOwnedReposDependencies {
  fetch: typeof globalThis.fetch
  listOrgs: (input: { login: string, userToken: string }) => Promise<OrgLookupOutcome>
  syncRepo: (
    owner: string,
    repo: string,
    bindings: GithubBindings,
    db: D1Database,
    opts?: SyncRepoOptions,
  ) => Promise<SyncRepoStats>
  resolveGithubBindings: typeof resolveGithubBindings
  now: () => number
  claimToken: () => string
}

const PER_PAGE = 100
const MAX_PAGES = 10
const CLAIM_STALE_SECONDS = 30 * 60

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseCodeSearchResponse(value: unknown): CodeSearchResponse | null {
  if (!isRecord(value)
    || typeof value.total_count !== 'number'
    || !Number.isInteger(value.total_count)
    || value.total_count < 0
    || typeof value.incomplete_results !== 'boolean'
    || !Array.isArray(value.items)) {
    return null
  }

  const items: CodeSearchItem[] = []
  for (const candidate of value.items) {
    if (!isRecord(candidate)
      || typeof candidate.path !== 'string'
      || !isRecord(candidate.repository)
      || typeof candidate.repository.name !== 'string'
      || !isRecord(candidate.repository.owner)
      || typeof candidate.repository.owner.login !== 'string'
      || (candidate.repository.fork !== undefined && typeof candidate.repository.fork !== 'boolean')) {
      return null
    }
    items.push({
      path: candidate.path,
      repository: {
        name: candidate.repository.name,
        owner: { login: candidate.repository.owner.login },
        fork: candidate.repository.fork === true,
      },
    })
  }

  return {
    total_count: value.total_count,
    incomplete_results: value.incomplete_results,
    items,
  }
}

/**
 * One GitHub account whose public Skills this scan searches.
 *
 * `user:<login>` never matches a repository an organisation owns, which is why
 * an organisation's Skills stayed invisible to this scan. Each organisation
 * the signed-in account belongs to gets its own `org:<login>` search.
 */
export interface ScanOwner {
  login: string
  qualifier: string
  ownerVerified: boolean
}

export type OrgLookupOutcome
  = | { _tag: 'orgs', logins: string[], visibility: 'member' | 'public' }
    | { _tag: 'unavailable', reason: string }

/**
 * Organisation logins, parsed once at the boundary.
 *
 * Returns null when the payload is not the list GitHub documents, so a shape
 * change costs the organisation half of the scan and never the whole scan.
 */
export function parseOrgListResponse(value: unknown): string[] | null {
  if (!Array.isArray(value))
    return null
  const logins: string[] = []
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.login !== 'string' || !candidate.login.trim())
      return null
    logins.push(candidate.login)
  }
  return logins
}

/**
 * The owners one scan searches: the account itself, then its organisations.
 *
 * `ownerVerified` stays true only for the account's own repositories. Being a
 * member of an organisation is not proof of authorship, so an organisation
 * repository enters the ledger unverified and earns trust the usual way.
 */
export function buildScanOwners(login: string, orgLogins: readonly string[]): ScanOwner[] {
  const owners: ScanOwner[] = [{ login, qualifier: `user:${login}`, ownerVerified: true }]
  const seen = new Set([login.toLowerCase()])
  for (const org of orgLogins) {
    const key = org.toLowerCase()
    if (seen.has(key))
      continue
    seen.add(key)
    owners.push({ login: org, qualifier: `org:${org}`, ownerVerified: false })
  }
  return owners
}

function emptyCounts(): ScanCounts {
  return {
    hits: 0,
    ownersScanned: 0,
    orgsScanned: 0,
    orgLookupError: null,
    reposFound: 0,
    reposSynced: 0,
    reposVerifiedOnly: 0,
    reposRejected: 0,
    reposFailed: 0,
    reposClaimedElsewhere: 0,
    reposAlreadyProcessed: 0,
    reposExhausted: 0,
    reposDeferred: 0,
    reposCandidateMissing: 0,
    reposCandidateStateFailed: 0,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function integerHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name)
  if (raw === null)
    return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

export function ownedRepoScanResponse(result: ScanResult) {
  return { ok: result._tag === 'complete', ...result }
}

export function ownedRepoScanWarning(result: ScanResult): Record<string, unknown> | null {
  if (result._tag === 'complete')
    return null
  const common = {
    outcome: result._tag,
    reposFound: result.reposFound,
    reposFailed: result.reposFailed,
  }
  if (result._tag === 'partial')
    return { ...common, reason: result.reason }
  if (result._tag === 'rate_limited') {
    return {
      ...common,
      status: result.status,
      rateLimitRemaining: result.rateLimitRemaining,
      rateLimitReset: result.rateLimitReset,
      requestId: result.requestId,
    }
  }
  if (result._tag === 'auth_failure')
    return { ...common, status: result.status }
  return { ...common, status: result.status, error: result.error }
}

/**
 * List the organisations the signed-in account belongs to.
 *
 * `GET /user/orgs` needs the `read:org` scope, which this app does not ask
 * for, so it answers 403 for most accounts. The public membership list needs
 * no scope at all, so it is the fallback rather than the failure. Adding
 * `read:org` would force every existing account to consent again, so the scan
 * takes what the current grant allows.
 */
export function makeGithubOrgLister(fetchImpl: typeof globalThis.fetch) {
  return async function listOrgs(
    input: { login: string, userToken: string },
  ): Promise<OrgLookupOutcome> {
    const member = await requestOrgList(
      fetchImpl,
      `https://api.github.com/user/orgs?per_page=${PER_PAGE}`,
      input.userToken,
    )
    if (member._tag === 'logins')
      return { _tag: 'orgs', logins: member.logins, visibility: 'member' }

    const publicOrgs = await requestOrgList(
      fetchImpl,
      `https://api.github.com/users/${encodeURIComponent(input.login)}/orgs?per_page=${PER_PAGE}`,
      input.userToken,
    )
    if (publicOrgs._tag === 'logins')
      return { _tag: 'orgs', logins: publicOrgs.logins, visibility: 'public' }
    return { _tag: 'unavailable', reason: `${member.reason}; ${publicOrgs.reason}` }
  }
}

type OrgListRequestOutcome
  = | { _tag: 'logins', logins: string[] }
    | { _tag: 'unavailable', reason: string }

async function requestOrgList(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  userToken: string,
): Promise<OrgListRequestOutcome> {
  const outcome = await fetchImpl.call(globalThis, url, {
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'skilld.dev',
    },
  }).then(
    response => ({ _tag: 'response' as const, response }),
    error => ({ _tag: 'network_failure' as const, error: errorMessage(error) }),
  )
  if (outcome._tag === 'network_failure')
    return { _tag: 'unavailable', reason: outcome.error }
  if (!outcome.response.ok)
    return { _tag: 'unavailable', reason: `org list ${outcome.response.status}` }

  const parsed = await outcome.response.json().then(
    value => parseOrgListResponse(value),
    () => null,
  )
  return parsed === null
    ? { _tag: 'unavailable', reason: 'Invalid GitHub organisation list response' }
    : { _tag: 'logins', logins: parsed }
}

export function makeOwnedRepoScanner(deps: ScanOwnedReposDependencies) {
  return async function scanOwnedRepos(input: ScanOwnedReposInput): Promise<ScanResult> {
    const { login, userToken, db, env } = input
    const seen = new Map<string, boolean>()
    const counts = emptyCounts()
    let partialReason: 'incomplete_results' | 'result_cap' | null = null
    let candidateStateFailure = false

    // An organisation's Skills are invisible to `user:<login>`. Losing the
    // organisation list costs those repositories, never the account's own, so
    // it is recorded and the scan continues.
    const orgLookup = await deps.listOrgs({ login, userToken })
    if (orgLookup._tag === 'unavailable')
      counts.orgLookupError = orgLookup.reason
    const owners = buildScanOwners(login, orgLookup._tag === 'orgs' ? orgLookup.logins : [])
    counts.ownersScanned = owners.length
    counts.orgsScanned = owners.length - 1

    for (const owner of owners) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const q = encodeURIComponent(`filename:SKILL.md ${owner.qualifier} is:public`)
        // Worker fetch requires the global receiver, not the dependency object.
        const responseOutcome = await deps.fetch.call(
          globalThis,
          `https://api.github.com/search/code?q=${q}&per_page=${PER_PAGE}&page=${page}`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'skilld.dev',
            },
          },
        ).then(
          response => ({ _tag: 'response' as const, response }),
          error => ({ _tag: 'network_failure' as const, error: errorMessage(error) }),
        )

        if (responseOutcome._tag === 'network_failure') {
          return { _tag: 'provider_failure', status: null, error: responseOutcome.error, ...counts }
        }

        const res = responseOutcome.response
        if (!res.ok) {
          if (res.status === 401)
            return { _tag: 'auth_failure', status: 401, ...counts }
          if (res.status === 403 || res.status === 429) {
            return {
              _tag: 'rate_limited',
              status: res.status,
              rateLimitRemaining: integerHeader(res.headers, 'x-ratelimit-remaining'),
              rateLimitReset: integerHeader(res.headers, 'x-ratelimit-reset'),
              requestId: res.headers.get('x-github-request-id'),
              ...counts,
            }
          }
          return { _tag: 'provider_failure', status: res.status, error: `GitHub code search ${res.status}`, ...counts }
        }

        const jsonOutcome = await res.json().then(
          value => ({ _tag: 'parsed' as const, value }),
          error => ({ _tag: 'parse_failure' as const, error: errorMessage(error) }),
        )
        if (jsonOutcome._tag === 'parse_failure')
          return { _tag: 'provider_failure', status: res.status, error: jsonOutcome.error, ...counts }

        const body = parseCodeSearchResponse(jsonOutcome.value)
        if (!body)
          return { _tag: 'provider_failure', status: res.status, error: 'Invalid GitHub code search response', ...counts }

        counts.hits = Math.max(counts.hits, body.total_count)
        if (body.incomplete_results)
          partialReason = 'incomplete_results'
        else if (body.total_count > PER_PAGE * MAX_PAGES && !partialReason)
          partialReason = 'result_cap'
        else if (page === MAX_PAGES && body.items.length === PER_PAGE && !partialReason)
          partialReason = 'result_cap'

        for (const item of body.items) {
          if (item.repository.fork || !isRegistrySkillPath(item.path))
            continue
          if (item.repository.owner.login.toLowerCase() !== owner.login.toLowerCase())
            continue
          const key = `${item.repository.owner.login}/${item.repository.name}`
          if (seen.has(key))
            continue
          seen.set(key, owner.ownerVerified)
          await upsertDiscoveryCandidate(db, {
            owner: item.repository.owner.login,
            repo: item.repository.name,
            source: 'owned_scan',
            discoveredAt: deps.now(),
            ownerVerified: owner.ownerVerified,
          })
        }

        if (body.items.length < PER_PAGE)
          break
      }
    }

    counts.reposFound = seen.size
    const bindings = deps.resolveGithubBindings(env)
    for (const full of seen.keys()) {
      const [owner, repo] = full.split('/') as [string, string]
      const attemptedAt = deps.now()
      const token = deps.claimToken()
      const claim = await claimDiscoveryCandidate(db, {
        owner,
        repo,
        now: attemptedAt,
        staleBefore: attemptedAt - CLAIM_STALE_SECONDS,
        token,
      })
      if (claim._tag !== 'claimed') {
        if (claim._tag === 'active_claim') {
          counts.reposClaimedElsewhere += 1
        }
        else if (claim._tag === 'complete') {
          counts.reposAlreadyProcessed += 1
        }
        else if (claim._tag === 'exhausted') {
          counts.reposExhausted += 1
        }
        else if (claim._tag === 'not_due') {
          counts.reposDeferred += 1
        }
        else if (claim._tag === 'missing') {
          counts.reposCandidateMissing += 1
          counts.reposFailed += 1
        }
        else {
          counts.reposCandidateStateFailed += 1
          counts.reposFailed += 1
        }
        continue
      }

      const syncOutcome = await deps.syncRepo(owner, repo, bindings, db, { ownerVerified: claim.ownerVerified }).then(
        stats => ({ _tag: 'stats' as const, stats }),
        error => ({ _tag: 'thrown' as const, error: errorMessage(error) }),
      )
      if (syncOutcome._tag === 'thrown') {
        const finishResult = await finishDiscoveryCandidateAttempt(db, {
          owner,
          repo,
          token,
          now: deps.now(),
          outcome: { _tag: 'retryable_failure', error: syncOutcome.error },
        })
        if (finishResult === 'stale_claim') {
          candidateStateFailure = true
          counts.reposCandidateStateFailed += 1
        }
        counts.reposFailed += 1
        continue
      }

      const stats = syncOutcome.stats
      const finishResult = await finishDiscoveryCandidateAttempt(db, {
        owner,
        repo,
        token,
        now: deps.now(),
        outcome: discoveryOutcomeFromSyncStats(stats),
      })
      if (finishResult === 'stale_claim') {
        candidateStateFailure = true
        counts.reposCandidateStateFailed += 1
        counts.reposFailed += 1
        continue
      }

      if (stats.status === 'indexed' && stats.skillsUpserted > 0)
        counts.reposSynced += 1
      else if (stats.status === 'verified-only')
        counts.reposVerifiedOnly += 1
      else if (stats.status === 'rejected')
        counts.reposRejected += 1
      else
        counts.reposFailed += 1
    }

    if (candidateStateFailure)
      return { _tag: 'partial', reason: 'candidate_state_failure', ...counts }
    if (partialReason)
      return { _tag: 'partial', reason: partialReason, ...counts }
    return { _tag: 'complete', ...counts }
  }
}

export const scanOwnedRepos = makeOwnedRepoScanner({
  fetch: globalThis.fetch,
  listOrgs: makeGithubOrgLister(globalThis.fetch),
  syncRepo,
  resolveGithubBindings,
  now: () => Math.floor(Date.now() / 1000),
  claimToken: () => crypto.randomUUID(),
})
