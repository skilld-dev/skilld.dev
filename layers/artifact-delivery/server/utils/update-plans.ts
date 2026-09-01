import type { UpdatePlanComparison, UpdatePlanResult } from '../schemas/update-plans'
import type { GithubAppClient } from './github-app'
import type { PrivateRepositoryAccessResult } from './private-access'
import { z } from 'zod'
import { COMMIT_SHA_PATTERN } from '../schemas/contracts'
import {
  comparisonRelationMatches,
  relationMatchesDirectionalCounts,
} from '../schemas/update-plans'
import { fetchNoRedirect } from './fetch-no-redirect'

const GITHUB_API = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'
const GITHUB_REQUEST_TIMEOUT_MS = 15_000
const MAX_GITHUB_COMPARE_BYTES = 8 * 1024 * 1024
const MAX_COMMITS = 500
const COMMITS_PER_PAGE = 100
const MAX_CONCURRENCY = 4
const CACHE_FRESH_MS = 5 * 60 * 1000
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
const CACHE_PREFIX = 'private-github-compare:v2:'

const shaSchema = z.string().regex(COMMIT_SHA_PATTERN)
const githubCountSchema = z.number().int().nonnegative().safe()

const githubCommitSchema = z.object({
  sha: shaSchema,
  commit: z.object({
    message: z.string(),
    author: z.object({
      name: z.string(),
      date: z.string().datetime(),
    }),
  }),
  author: z.object({
    login: z.string().min(1).max(100),
  }).nullable().optional(),
})

const githubComparisonSchema = z.object({
  status: z.enum(['ahead', 'behind', 'diverged', 'identical']),
  ahead_by: githubCountSchema,
  behind_by: githubCountSchema,
  total_commits: githubCountSchema,
  commits: z.array(githubCommitSchema).max(COMMITS_PER_PAGE),
}).superRefine((value, context) => {
  if (value.total_commits !== value.ahead_by) {
    context.addIssue({
      code: 'custom',
      message: 'total_commits must equal ahead_by',
      path: ['total_commits'],
    })
  }
  if (!relationMatchesDirectionalCounts(value.status, value.ahead_by, value.behind_by)) {
    context.addIssue({
      code: 'custom',
      message: 'status must match directional counts',
      path: ['status'],
    })
  }
})

const readyComparisonSchema = z.object({
  relation: z.enum(['ahead', 'behind', 'diverged', 'identical']),
  aheadBy: githubCountSchema,
  behindBy: githubCountSchema,
  commits: z.array(z.object({
    sha: shaSchema,
    subject: z.string().min(1).max(500),
    timestamp: z.string().datetime(),
    author: z.object({
      name: z.string().min(1).max(200),
      login: z.string().min(1).max(100).nullable(),
    }).strict(),
  }).strict()).max(MAX_COMMITS),
  total: z.number().int().nonnegative().safe(),
  truncated: z.boolean(),
  compareUrl: z.string().url().max(2048),
}).strict().superRefine((value, context) => {
  if (value.total !== value.aheadBy) {
    context.addIssue({
      code: 'custom',
      message: 'total must equal aheadBy',
      path: ['total'],
    })
  }
  if (!relationMatchesDirectionalCounts(value.relation, value.aheadBy, value.behindBy)) {
    context.addIssue({
      code: 'custom',
      message: 'relation must match directional counts',
      path: ['relation'],
    })
  }
})

const cachedComparisonSchema = z.object({
  version: z.literal(2),
  etag: z.string()
    .min(1)
    .max(1024)
    .refine(isSafeHttpHeaderValue)
    .nullable(),
  checkedAt: z.number().int().nonnegative().safe(),
  value: readyComparisonSchema,
}).strict()

type ReadyComparison = z.infer<typeof readyComparisonSchema>
type CompareOutcome
  = { _tag: 'ready', value: ReadyComparison }
    | { _tag: 'not_found' }
    | { _tag: 'invalid_comparison' }
    | {
      _tag: 'rate_limited'
      retryAfterSeconds: number | null
      resetAt: string | null
    }
    | { _tag: 'provider_failure', status: number | null }

type FailureOperation
  = 'cache-read'
    | 'cache-write'
    | 'github-compare'
    | 'repository-access'

export interface GithubUpdatePlansDependencies {
  findAccess: (owner: string, repository: string) => Promise<PrivateRepositoryAccessResult>
  loadUserToken: () => Promise<string | null>
  githubApp: Pick<GithubAppClient, 'createRepositoryToken' | 'userCanAccessRepository'>
  fetch: typeof globalThis.fetch
  cache?: UpdatePlansCache
  now: () => number
  reportFailure: (operation: FailureOperation) => void
}

export interface UpdatePlansCache {
  get: (key: string, type: 'json') => Promise<unknown>
  put: (
    key: string,
    value: string,
    options: { expirationTtl: number },
  ) => Promise<void>
}

interface RepositoryGroup {
  owner: string
  repository: string
  comparisons: Array<{ input: UpdatePlanComparison, index: number }>
}

type AuthorizedRepository
  = {
    _tag: 'authorized'
    owner: string
    repository: string
    token: string
  }
  | { _tag: 'not_found' }
  | { _tag: 'provider_failure' }

interface ComparisonTask {
  owner: string
  repository: string
  token: string
  input: UpdatePlanComparison
  targets: Array<{ input: UpdatePlanComparison, index: number }>
}

export async function createGithubUpdatePlans(
  comparisons: UpdatePlanComparison[],
  dependencies: GithubUpdatePlansDependencies,
): Promise<UpdatePlanResult[]> {
  const userTokenOutcome = await dependencies.loadUserToken().then(
    token => ({ _tag: 'loaded' as const, token }),
    () => ({ _tag: 'failed' as const }),
  )
  if (userTokenOutcome._tag === 'failed') {
    dependencies.reportFailure('repository-access')
    return comparisons.map(input => presentFailure(input, 'provider_failure', null))
  }
  if (!userTokenOutcome.token)
    return comparisons.map(input => presentFailure(input, 'not_found'))
  const userToken = userTokenOutcome.token

  const groups = groupByRepository(comparisons)
  const authorizations = await mapLimit(groups, MAX_CONCURRENCY, async group => ({
    group,
    authorization: await authorizeRepository(group, userToken, dependencies),
  }))
  const results: Array<UpdatePlanResult | undefined> = Array.from({ length: comparisons.length })
  const tasks: ComparisonTask[] = []

  for (const { group, authorization } of authorizations) {
    if (authorization._tag !== 'authorized') {
      for (const target of group.comparisons) {
        results[target.index] = authorization._tag === 'not_found'
          ? presentFailure(target.input, 'not_found')
          : presentFailure(target.input, 'provider_failure', null)
      }
      continue
    }
    const byRange = new Map<string, ComparisonTask>()
    for (const target of group.comparisons) {
      const key = `${target.input.baseSha}:${target.input.headSha}`
      const task = byRange.get(key)
      if (task) {
        task.targets.push(target)
        continue
      }
      byRange.set(key, {
        owner: authorization.owner,
        repository: authorization.repository,
        token: authorization.token,
        input: target.input,
        targets: [target],
      })
    }
    tasks.push(...byRange.values())
  }

  const comparisonsByRange = await mapLimit(tasks, MAX_CONCURRENCY, async task => ({
    task,
    outcome: await compareExactCommits(task, dependencies),
  }))
  for (const { task, outcome } of comparisonsByRange) {
    for (const target of task.targets)
      results[target.index] = presentOutcome(target.input, outcome)
  }

  return results.map((result, index) => result
    ?? presentFailure(comparisons[index]!, 'provider_failure', null))
}

async function authorizeRepository(
  group: RepositoryGroup,
  userToken: string,
  dependencies: GithubUpdatePlansDependencies,
): Promise<AuthorizedRepository> {
  const accessOutcome = await dependencies.findAccess(group.owner, group.repository).then(
    access => ({ _tag: 'loaded' as const, access }),
    () => ({ _tag: 'failed' as const }),
  )
  if (accessOutcome._tag === 'failed') {
    dependencies.reportFailure('repository-access')
    return { _tag: 'provider_failure' }
  }
  const access = accessOutcome.access
  if (
    access._tag === 'not-found'
    || access.owner.toLowerCase() !== group.owner.toLowerCase()
    || access.repository.toLowerCase() !== group.repository.toLowerCase()
  ) {
    return { _tag: 'not_found' }
  }

  const recheck = await dependencies.githubApp.userCanAccessRepository(
    userToken,
    access.installationId,
    access.repositoryId,
  ).then(
    allowed => ({ _tag: 'checked' as const, allowed }),
    () => ({ _tag: 'failed' as const }),
  )
  if (recheck._tag === 'failed') {
    dependencies.reportFailure('repository-access')
    return { _tag: 'provider_failure' }
  }
  if (!recheck.allowed)
    return { _tag: 'not_found' }

  const token = await dependencies.githubApp.createRepositoryToken(
    access.installationId,
    access.repositoryId,
  ).then(
    result => ({ _tag: 'loaded' as const, result }),
    () => ({ _tag: 'failed' as const }),
  )
  if (token._tag === 'failed') {
    dependencies.reportFailure('repository-access')
    return { _tag: 'provider_failure' }
  }
  if (token.result._tag === 'not-found')
    return { _tag: 'not_found' }
  return {
    _tag: 'authorized',
    owner: access.owner,
    repository: access.repository,
    token: token.result.token,
  }
}

async function compareExactCommits(
  task: ComparisonTask,
  dependencies: GithubUpdatePlansDependencies,
): Promise<CompareOutcome> {
  const cacheKey = comparisonCacheKey(task)
  const cached = await readCachedComparison(cacheKey, task.input, dependencies)
  const now = dependencies.now()
  if (cached && now >= cached.checkedAt && now - cached.checkedAt < CACHE_FRESH_MS)
    return { _tag: 'ready', value: cached.value }

  const firstPage = await requestComparisonPage(task, 1, cached?.etag, dependencies)
  if (firstPage._tag === 'not_modified') {
    if (!cached)
      return { _tag: 'provider_failure', status: 304 }
    await writeCachedComparison(cacheKey, {
      ...cached,
      checkedAt: now,
    }, dependencies)
    return { _tag: 'ready', value: cached.value }
  }
  if (firstPage._tag !== 'page')
    return firstPage

  const relation = firstPage.value.status
  const aheadBy = firstPage.value.ahead_by
  const behindBy = firstPage.value.behind_by
  const total = firstPage.value.total_commits
  const etag = firstPage.etag
  const firstIncludedIndex = Math.max(0, total - MAX_COMMITS)
  const firstIncludedPage = Math.floor(firstIncludedIndex / COMMITS_PER_PAGE) + 1
  const firstPageOffset = firstIncludedIndex % COMMITS_PER_PAGE
  const lastIncludedPage = Math.max(1, Math.ceil(total / COMMITS_PER_PAGE))
  const commits: ReadyComparison['commits'] = []

  for (let page = firstIncludedPage; page <= lastIncludedPage; page++) {
    const pageOutcome = page === 1
      ? firstPage
      : await requestComparisonPage(task, page, null, dependencies)
    if (pageOutcome._tag !== 'page') {
      return pageOutcome._tag === 'not_modified'
        ? { _tag: 'provider_failure', status: 304 }
        : pageOutcome
    }
    if (
      pageOutcome.value.status !== relation
      || pageOutcome.value.ahead_by !== aheadBy
      || pageOutcome.value.behind_by !== behindBy
      || pageOutcome.value.total_commits !== total
    ) {
      dependencies.reportFailure('github-compare')
      return { _tag: 'provider_failure', status: 502 }
    }
    const pageCommits = page === firstIncludedPage
      ? pageOutcome.value.commits.slice(firstPageOffset)
      : pageOutcome.value.commits
    commits.push(...pageCommits.map(presentCommit))
  }
  if (commits.length > MAX_COMMITS)
    commits.splice(0, commits.length - MAX_COMMITS)
  const expectedCommitCount = Math.min(total, MAX_COMMITS)
  const uniqueCommitCount = new Set(commits.map(commit => commit.sha)).size
  if (commits.length !== expectedCommitCount || uniqueCommitCount !== commits.length) {
    dependencies.reportFailure('github-compare')
    return { _tag: 'provider_failure', status: 502 }
  }

  const value: ReadyComparison = {
    relation,
    aheadBy,
    behindBy,
    commits,
    total,
    truncated: commits.length < total,
    compareUrl: githubCompareUrl(task.owner, task.repository, task.input.baseSha, task.input.headSha),
  }
  await writeCachedComparison(cacheKey, {
    version: 2,
    etag,
    checkedAt: now,
    value,
  }, dependencies)
  return { _tag: 'ready', value }
}

function presentCommit(commit: z.infer<typeof githubCommitSchema>): ReadyComparison['commits'][number] {
  return {
    sha: commit.sha,
    subject: sanitizeLine(commit.commit.message, 500, 'No commit subject'),
    timestamp: commit.commit.author.date,
    author: {
      name: sanitizeLine(
        commit.commit.author.name,
        200,
        commit.author?.login ?? 'Unknown',
      ),
      login: commit.author?.login ?? null,
    },
  }
}

type ComparisonPageOutcome
  = { _tag: 'page', value: z.infer<typeof githubComparisonSchema>, etag: string | null }
    | { _tag: 'not_modified' }
    | Exclude<CompareOutcome, { _tag: 'ready' }>

async function requestComparisonPage(
  task: ComparisonTask,
  page: number,
  etag: string | null | undefined,
  dependencies: GithubUpdatePlansDependencies,
): Promise<ComparisonPageOutcome> {
  const headers = new Headers({
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${task.token}`,
    'User-Agent': 'skilld.dev',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  })
  if (etag)
    headers.set('If-None-Match', etag)
  const url = `${GITHUB_API}/repos/${encodeURIComponent(task.owner)}/${encodeURIComponent(task.repository)}/compare/${task.input.baseSha}...${task.input.headSha}?per_page=${COMMITS_PER_PAGE}&page=${page}`
  const responseOutcome = await fetchNoRedirect(dependencies.fetch, url, {
    headers,
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  }).catch(() => ({ _tag: 'failed' as const }))
  if (responseOutcome._tag === 'failed') {
    dependencies.reportFailure('github-compare')
    return { _tag: 'provider_failure', status: null }
  }
  if (responseOutcome._tag === 'unexpected-redirect') {
    dependencies.reportFailure('github-compare')
    return { _tag: 'provider_failure', status: responseOutcome.status }
  }

  const response = responseOutcome.response
  if (response.status === 304) {
    await discardResponseBody(response, dependencies)
    return { _tag: 'not_modified' }
  }
  if (isRateLimited(response)) {
    await discardResponseBody(response, dependencies)
    return {
      _tag: 'rate_limited',
      retryAfterSeconds: retryAfterSeconds(response.headers, dependencies.now()),
      resetAt: rateLimitResetAt(response.headers),
    }
  }
  if (response.status === 404) {
    await discardResponseBody(response, dependencies)
    return { _tag: 'not_found' }
  }
  if (response.status === 409 || response.status === 422) {
    await discardResponseBody(response, dependencies)
    return { _tag: 'invalid_comparison' }
  }
  if (!response.ok) {
    await discardResponseBody(response, dependencies)
    dependencies.reportFailure('github-compare')
    return { _tag: 'provider_failure', status: response.status }
  }

  const jsonOutcome = await readBoundedJson(response, MAX_GITHUB_COMPARE_BYTES).then(
    value => ({ _tag: 'parsed' as const, value }),
    () => ({ _tag: 'failed' as const }),
  )
  if (jsonOutcome._tag === 'failed') {
    dependencies.reportFailure('github-compare')
    return { _tag: 'provider_failure', status: response.status }
  }
  const parsed = githubComparisonSchema.safeParse(jsonOutcome.value)
  if (
    !parsed.success
    || !comparisonRelationMatches(
      parsed.data.status,
      parsed.data.ahead_by,
      parsed.data.behind_by,
      task.input.baseSha,
      task.input.headSha,
    )
  ) {
    dependencies.reportFailure('github-compare')
    return { _tag: 'provider_failure', status: response.status }
  }
  return {
    _tag: 'page',
    value: parsed.data,
    etag: response.headers.get('etag'),
  }
}

async function readCachedComparison(
  key: string,
  input: UpdatePlanComparison,
  dependencies: GithubUpdatePlansDependencies,
) {
  if (!dependencies.cache)
    return null
  const outcome = await dependencies.cache.get(key, 'json').then(
    value => ({ _tag: 'read' as const, value }),
    () => ({ _tag: 'failed' as const }),
  )
  if (outcome._tag === 'failed') {
    dependencies.reportFailure('cache-read')
    return null
  }
  if (outcome.value === null)
    return null
  const parsed = cachedComparisonSchema.safeParse(outcome.value)
  if (
    !parsed.success
    || !comparisonRelationMatches(
      parsed.data.value.relation,
      parsed.data.value.aheadBy,
      parsed.data.value.behindBy,
      input.baseSha,
      input.headSha,
    )
  ) {
    dependencies.reportFailure('cache-read')
    return null
  }
  return parsed.data
}

async function writeCachedComparison(
  key: string,
  value: z.infer<typeof cachedComparisonSchema>,
  dependencies: GithubUpdatePlansDependencies,
): Promise<void> {
  if (!dependencies.cache)
    return
  const outcome = await dependencies.cache.put(
    key,
    JSON.stringify(value),
    { expirationTtl: CACHE_TTL_SECONDS },
  ).then(
    () => ({ _tag: 'written' as const }),
    () => ({ _tag: 'failed' as const }),
  )
  if (outcome._tag === 'failed')
    dependencies.reportFailure('cache-write')
}

function groupByRepository(comparisons: UpdatePlanComparison[]): RepositoryGroup[] {
  const groups = new Map<string, RepositoryGroup>()
  comparisons.forEach((input, index) => {
    const key = `${input.owner.toLowerCase()}/${input.repository.toLowerCase()}`
    const group = groups.get(key)
    if (group) {
      group.comparisons.push({ input, index })
      return
    }
    groups.set(key, {
      owner: input.owner,
      repository: input.repository,
      comparisons: [{ input, index }],
    })
  })
  return [...groups.values()]
}

function presentOutcome(input: UpdatePlanComparison, outcome: CompareOutcome): UpdatePlanResult {
  if (outcome._tag === 'ready') {
    return {
      _tag: 'ready',
      ...input,
      ...outcome.value,
    }
  }
  if (outcome._tag === 'rate_limited') {
    return {
      _tag: 'rate_limited',
      ...input,
      retryAfterSeconds: outcome.retryAfterSeconds,
      resetAt: outcome.resetAt,
    }
  }
  if (outcome._tag === 'provider_failure')
    return presentFailure(input, 'provider_failure', outcome.status)
  return presentFailure(input, outcome._tag)
}

function presentFailure(
  input: UpdatePlanComparison,
  tag: 'not_found' | 'invalid_comparison',
): UpdatePlanResult
function presentFailure(
  input: UpdatePlanComparison,
  tag: 'provider_failure',
  status: number | null,
): UpdatePlanResult
function presentFailure(
  input: UpdatePlanComparison,
  tag: 'not_found' | 'invalid_comparison' | 'provider_failure',
  status?: number | null,
): UpdatePlanResult {
  return tag === 'provider_failure'
    ? { _tag: tag, ...input, status: status ?? null }
    : { _tag: tag, ...input }
}

function comparisonCacheKey(task: ComparisonTask): string {
  return `${CACHE_PREFIX}${task.owner.toLowerCase()}/${task.repository.toLowerCase()}:${task.input.baseSha}:${task.input.headSha}`
}

function githubCompareUrl(owner: string, repository: string, baseSha: string, headSha: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/compare/${baseSha}...${headSha}`
}

function isRateLimited(response: Response): boolean {
  return response.status === 429
    || (response.status === 403 && (
      response.headers.get('x-ratelimit-remaining') === '0'
      || response.headers.has('retry-after')
    ))
}

async function discardResponseBody(
  response: Response,
  dependencies: GithubUpdatePlansDependencies,
): Promise<void> {
  if (!response.body)
    return
  await response.body.cancel().catch(() => {
    dependencies.reportFailure('github-compare')
  })
}

function isSafeHttpHeaderValue(value: string): boolean {
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint >= 0x20 && codePoint <= 0x7E
  })
}

function retryAfterSeconds(headers: Headers, now: number): number | null {
  const raw = headers.get('retry-after')
  if (!raw)
    return null
  const seconds = Number(raw)
  if (Number.isSafeInteger(seconds) && seconds >= 0)
    return Math.min(seconds, 604_800)
  const date = Date.parse(raw)
  if (!Number.isFinite(date))
    return null
  return Math.min(Math.max(0, Math.ceil((date - now) / 1000)), 604_800)
}

function rateLimitResetAt(headers: Headers): string | null {
  const raw = headers.get('x-ratelimit-reset')
  if (raw === null)
    return null
  const seconds = Number(raw)
  if (!Number.isSafeInteger(seconds) || seconds < 0)
    return null
  const milliseconds = seconds * 1000
  return Number.isFinite(milliseconds) && milliseconds <= 8.64e15
    ? new Date(milliseconds).toISOString()
    : null
}

function sanitizeLine(value: string, maximumLength: number, fallback: string): string {
  const firstLine = value.split(/\r\n?|\n/u, 1)[0] ?? ''
  const sanitized = [...firstLine]
    .map(character => isUnsafeTerminalCharacter(character.codePointAt(0)!) ? ' ' : character)
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
  return truncateUtf16(sanitized || fallback, maximumLength)
}

function isUnsafeTerminalCharacter(codePoint: number): boolean {
  return codePoint <= 0x1F
    || (codePoint >= 0x7F && codePoint <= 0x9F)
    || codePoint === 0x200E
    || codePoint === 0x200F
    || (codePoint >= 0x202A && codePoint <= 0x202E)
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
}

function truncateUtf16(value: string, maximumLength: number): string {
  let result = ''
  for (const character of value) {
    if (result.length + character.length > maximumLength)
      break
    result += character
  }
  return result
}

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel('response too large')
    throw new Error('GitHub compare response exceeded the byte limit')
  }
  if (!response.body)
    throw new Error('GitHub compare returned an empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done)
      break
    size += next.value.byteLength
    if (size > maximumBytes) {
      await reader.cancel('response too large')
      throw new Error('GitHub compare response exceeded the byte limit')
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  transform: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: values.length })
  let next = 0
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++
      results[index] = await transform(values[index]!)
    }
  })
  await Promise.all(workers)
  return results
}
