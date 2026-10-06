import type { ProblemCode, ResolvedSource, SourceRequest } from '../schemas/contracts'
import type { GithubReadTry } from './github-read'
import type { TarballExtraction } from './tarball-source'
import { z } from 'zod'
import { canonicalSkillFolder, isRegistrySkillPath, slugifySkillName } from '#shared/skill-path'
import { base64ToBytes, gitBlobShaHex } from './encoding'
import { fetchNoRedirect } from './fetch-no-redirect'
import {
  describeReadError,
  GITHUB_READ_TRY_TIMEOUT_MS,
  githubEndpointPath,
  isBodyLimitError,
  isRetryableGithubStatus,
  isTruncatedBody,
  readGithubWithRetry,
} from './github-read'
import { extractSkillFilesFromTarball } from './tarball-source'
import { projectedUstarBytes } from './ustar'

const GITHUB_API = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'
const MAX_GITHUB_JSON_BYTES = 8 * 1024 * 1024
const MAX_TREE_ENTRIES = 2000
const MAX_TREE_REQUESTS = 128
/**
 * The tree reads one search by name may spend. Every read comes out of the
 * site's GitHub quota, and anyone can send a name. Measured 2026-10-07 on the
 * split walk: n8n-io/n8n needs 27, vercel/next.js 37, openshift/hypershift 45.
 * posthog/posthog needs more than 128 and stops after about 40.
 */
const MAX_NAME_SEARCH_TREE_READS = 64
// One tree read can hold 8 MiB of JSON and the tree parsed from it. Two at a
// time keep a split walk well inside a Worker's 128 MiB.
const TREE_WALK_CONCURRENCY = 2
const MAX_SKILL_PATH_SEGMENTS = 64
// One invocation loads every blob once. With one repository read per load and
// resolve, a handful of tree reads, the D1 state transitions and the R2 write,
// 900 files is the largest ceiling that keeps the worst build inside the
// Worker's 1000-subrequest budget.
const MAX_ARTIFACT_FILES = 900
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024
// A Repository tarball is one request that costs no REST quota, and it carries
// every file of the Skill. Measured 2026-09-22 on a 33-Skill Repository: 3
// counted requests and 0.45 s, against 6,525 requests and about 377 s per
// blob. See notes/skilld-tarball-delivery-spike-2026-09-22.
const TARBALL_REQUEST_TIMEOUT_MS = 60_000
/**
 * The largest Git tree the tarball path will read for, in source bytes.
 *
 * The extracted files stay in the isolate until the Artifact is packaged, and
 * a Worker has 128 MiB. `MAX_ARTIFACT_BYTES` binds first for every Skill built
 * today; this ceiling states the memory budget the byte source itself has to
 * respect.
 */
export const TARBALL_MAX_TREE_BYTES = 128 * 1024 * 1024
/**
 * The archive is the whole Repository, whose size no cheap request reveals:
 * codeload sends no `content-length` until that exact commit is cached, so the
 * only reliable guard is a running count with a hard stop. Measured: the stop
 * cancelled a 1.5 GiB archive after 64 MiB, 2.9 s and 390 ms of CPU.
 */
export const TARBALL_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const repositoryResponseSchema = z.object({
  id: z.number().int().positive().safe(),
  name: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }),
  private: z.boolean(),
  default_branch: z.string().min(1),
})
const commitResponseSchema = z.object({
  sha: shaSchema,
  commit: z.object({ tree: z.object({ sha: shaSchema }) }),
})
const gitObjectSchema = z.object({
  type: z.enum(['blob', 'commit', 'tag', 'tree']),
  sha: shaSchema,
})
const gitRefResponseSchema = z.object({
  ref: z.string().min(1),
  object: gitObjectSchema,
})
const annotatedTagResponseSchema = z.object({
  sha: shaSchema,
  object: gitObjectSchema,
})
const treeEntrySchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(['blob', 'tree', 'commit']),
  sha: shaSchema,
  size: z.number().int().nonnegative().optional(),
})
const treeResponseSchema = z.object({
  sha: shaSchema,
  truncated: z.boolean().optional(),
  tree: z.array(treeEntrySchema),
})
const blobResponseSchema = z.object({
  sha: shaSchema,
  size: z.number().int().nonnegative(),
  encoding: z.literal('base64'),
  content: z.string(),
})

type TreeEntry = z.infer<typeof treeEntrySchema>

/** Where the GitHub API serves a Repository now. */
interface RepositoryName {
  owner: string
  repository: string
}

interface ListedTree {
  _tag: 'listed'
  entries: TreeEntry[]
  truncated: boolean
}

export interface ArtifactSourceFile {
  path: string
  mode: 420 | 493
  bytes: Uint8Array
  gitBlobSha: string
}

/** A Skill file left out of the Artifact because it is over a size limit. */
export interface OmittedArtifactFile {
  /** The path inside the Skill folder. */
  path: string
  bytes: number
  /** The file on GitHub at the Artifact's commit. */
  url: string
}

export interface LoadedArtifactSource {
  source: ResolvedSource
  files: ArtifactSourceFile[]
  omitted: OmittedArtifactFile[]
}

export interface SourceRejection {
  _tag: 'rejected'
  code: ProblemCode
  summary: string
  findings: string[]
  /** Unix seconds the caller may try again, when the upstream said so. */
  retryAfterSeconds?: number
}

export type ResolveSourceResult
  = { _tag: 'resolved', source: ResolvedSource }
    | SourceRejection

export type LoadSourceResult
  = { _tag: 'loaded', value: LoadedArtifactSource }
    | SourceRejection

export interface PublicGithubSourceClient {
  resolve: (request: SourceRequest) => Promise<ResolveSourceResult>
  load: (source: ResolvedSource) => Promise<LoadSourceResult>
}

/** One failed GitHub REST read. It never carries a token or a query string. */
export interface GithubReadFailure {
  step: GithubReadStep
  endpoint: string
  reason: string
  status: number | null
  attempts: number
}

export type GithubReadStep = 'repository' | 'ref' | 'tag' | 'commit' | 'tree' | 'blob'

interface GithubClientOptions {
  fetch: typeof globalThis.fetch
  token?: string
  visibility?: 'public' | 'private'
  /** Called once for every read that ends in failure, before it throws. */
  onReadFailure?: (failure: GithubReadFailure) => void
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  /**
   * Holds GitHub answers that never change: a commit and a tree, each read by
   * its SHA. Pass it to a public client only, so private trees stay out.
   */
  cache?: GithubObjectCache
}

/**
 * A store for immutable GitHub answers. `get` answers null for a miss. The
 * caller parses every value again, so a stale or foreign value only misses.
 */
export interface GithubObjectCache {
  get: (key: string) => Promise<unknown>
  put: (key: string, value: unknown) => Promise<void>
}

export function createPublicGithubSourceClient(options: GithubClientOptions): PublicGithubSourceClient {
  return createGithubSourceClient({ ...options, visibility: 'public' })
}

export function createGithubSourceClient(options: GithubClientOptions): PublicGithubSourceClient {
  const expectedVisibility = options.visibility ?? 'public'
  const readRejection = (outcome: FailedReadOutcome) =>
    outcome._tag === 'rate-limited'
      ? rateLimitRejection(outcome.resetAt)
      : sourceReadRejection(outcome._tag, expectedVisibility)
  const requestJson = async <T>(step: GithubReadStep, path: string, schema: z.ZodType<T>): Promise<ReadOutcome<T>> => {
    type Outcome = ReadOutcome<T>
    const headers = new Headers({
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skilld.dev',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    })
    if (options.token)
      headers.set('Authorization', `Bearer ${options.token}`)
    // Every try requests this same URL, so a retry can never read another ref.
    const url = `${GITHUB_API}${path}`
    const fetchOnce = (target: string) => fetchNoRedirect(options.fetch, target, {
      headers,
      signal: AbortSignal.timeout(GITHUB_READ_TRY_TIMEOUT_MS),
    })
    // A renamed or transferred Repository answers its old name with a 301 to
    // `/repositories/<id>`. The read follows that one hop, so a run of the old
    // name keeps working. Every other redirect stays fatal.
    const fetchFollowingMove = async () => {
      const fetched = await fetchOnce(url)
      if (fetched._tag !== 'unexpected-redirect')
        return fetched
      const moved = movedRepositoryUrl(fetched.location)
      return moved ? await fetchOnce(moved) : fetched
    }
    const tryOnce = async (): Promise<GithubReadTry<Outcome>> => {
      const sent = await fetchFollowingMove().then(
        fetched => ({ _tag: 'sent' as const, fetched }),
        (error: unknown) => ({ _tag: 'threw' as const, error }),
      )
      if (sent._tag === 'threw')
        return { _tag: 'transient', reason: describeReadError(sent.error), status: null }
      const fetched = sent.fetched
      if (fetched._tag === 'unexpected-redirect')
        return { _tag: 'fatal', reason: `GitHub redirected ${fetched.status} to ${fetched.location ?? 'an unknown location'}`, status: fetched.status }
      const response = fetched.response
      if (response.status === 404)
        return { _tag: 'settled', value: { _tag: 'not-found' } }
      if (response.status === 401 || response.status === 403) {
        // A spent quota is a fact about this minute, not about the Repository.
        // It used to throw, which wrote nothing: the Resolution sat in its
        // current state through the 60, 120, 240, 480 second delivery ladder and
        // then failed as SERVICE_UNAVAILABLE with no reason on it.
        if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
          return { _tag: 'settled', value: { _tag: 'rate-limited', resetAt: epochHeader(response.headers, 'x-ratelimit-reset') } }
        return { _tag: 'settled', value: { _tag: 'access-denied' } }
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {
          // The status already decided the outcome. A body that will not close changes nothing.
        })
        return {
          _tag: isRetryableGithubStatus(response.status) ? 'transient' : 'fatal',
          reason: `GitHub returned ${response.status}`,
          status: response.status,
        }
      }
      const body = await readBoundedJson(response, MAX_GITHUB_JSON_BYTES)
        .catch((error: unknown) => ({ _tag: 'unreadable' as const, error }))
      // A body over the limit is a fact about the Git object, so it settles
      // as a value each caller can answer. It used to throw, which spent the
      // whole queue retry ladder and then failed as SERVICE_UNAVAILABLE.
      if (body._tag === 'too-large')
        return { _tag: 'settled', value: { _tag: 'too-large' } }
      if (body._tag === 'unreadable') {
        const transient = !isBodyLimitError(body.error)
        return {
          _tag: transient ? 'transient' : 'fatal',
          reason: isTruncatedBody(body.error) ? 'GitHub returned a truncated response' : describeReadError(body.error),
          status: response.status,
        }
      }
      const parsed = schema.safeParse(body.value)
      if (!parsed.success)
        return { _tag: 'fatal', reason: 'GitHub returned an invalid response', status: response.status }
      return { _tag: 'settled', value: { _tag: 'ok', value: parsed.data } }
    }

    const result = await readGithubWithRetry(tryOnce, { sleep: options.sleep, random: options.random })
    if (result._tag === 'settled')
      return result.value
    const endpoint = githubEndpointPath(path)
    options.onReadFailure?.({ step, endpoint, reason: result.reason, status: result.status, attempts: result.attempts })
    throw new Error(`GitHub read failed at ${step} ${endpoint}: ${result.reason}`)
  }

  /**
   * A read whose answer the SHA in its key fixes forever. Only an answer that
   * parsed is stored; a miss, a limit or a refusal always asks GitHub again.
   */
  const requestImmutableJson = async <T>(key: string, step: GithubReadStep, path: string, schema: z.ZodType<T>): Promise<ReadOutcome<T>> => {
    const cache = options.cache
    if (cache) {
      const cached = schema.safeParse(await cache.get(key))
      if (cached.success)
        return { _tag: 'ok', value: cached.data }
    }
    const response = await requestJson(step, path, schema)
    if (cache && response._tag === 'ok')
      await cache.put(key, response.value)
    return response
  }

  // A tree SHA names its listing in any Repository that holds it, so the key
  // needs no Repository. The commit that names the tree is read per Repository.
  const getTree = async (owner: string, repository: string, sha: string, recursive: boolean) => {
    const suffix = recursive ? '?recursive=1' : ''
    const response = await requestImmutableJson(
      `tree:${sha}${recursive ? ':recursive' : ''}`,
      'tree',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/trees/${sha}${suffix}`,
      treeResponseSchema,
    )
    if (response._tag === 'ok' && response.value.sha !== sha)
      return { _tag: 'identity-mismatch' as const }
    return response
  }

  const resolveGitRefCommit = async (
    owner: string,
    repository: string,
    type: 'branch' | 'tag',
    value: string,
  ): Promise<string | SourceRejection> => {
    const namespace = type === 'branch' ? 'heads' : 'tags'
    const expectedRef = `refs/${namespace}/${value}`
    const gitRef = await requestJson(
      'ref',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/ref/${namespace}/${encodeURIComponent(value)}`,
      gitRefResponseSchema,
    )
    if (gitRef._tag !== 'ok')
      return readRejection(gitRef)
    if (gitRef.value.ref !== expectedRef)
      return reject('INVALID_SOURCE', 'GitHub returned another Git reference.', [gitRef.value.ref])
    if (type === 'branch') {
      return gitRef.value.object.type === 'commit'
        ? gitRef.value.object.sha
        : reject('INVALID_SOURCE', 'The Git branch does not point to a commit.', [value])
    }

    let object = gitRef.value.object
    const seen = new Set<string>()
    for (let depth = 0; depth < 8; depth++) {
      if (object.type === 'commit')
        return object.sha
      if (object.type !== 'tag' || seen.has(object.sha))
        return reject('INVALID_SOURCE', 'The Git tag does not resolve to a commit.', [value])
      seen.add(object.sha)
      const tag = await requestJson(
        'tag',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/tags/${object.sha}`,
        annotatedTagResponseSchema,
      )
      if (tag._tag !== 'ok')
        return readRejection(tag)
      if (tag.value.sha !== object.sha)
        return reject('INVALID_SOURCE', 'GitHub returned another Git tag identity.', [value])
      object = tag.value.object
    }
    return reject('INVALID_SOURCE', 'The Git tag chain exceeded the depth limit.', [value])
  }

  const listTreeBounded = async (
    owner: string,
    repository: string,
    rootTreeSha: string,
  ): Promise<ListedTree | SourceRejection> => {
    const recursive = await getTree(owner, repository, rootTreeSha, true)
    if (recursive._tag !== 'ok' && recursive._tag !== 'too-large')
      return readRejection(recursive)
    if (recursive._tag === 'ok' && !recursive.value.truncated) {
      if (recursive.value.tree.length > MAX_TREE_ENTRIES)
        return sourceLimitRejection(`The Skill folder has more than ${MAX_TREE_ENTRIES} entries.`)
      return { _tag: 'listed', entries: recursive.value.tree, truncated: false }
    }

    // GitHub truncated the listing, or it passed the read limit. Both mean
    // one response could not hold it, so walk one tree per directory.
    const entries: TreeEntry[] = []
    const queue: Array<{ sha: string, prefix: string }> = [{ sha: rootTreeSha, prefix: '' }]
    let requests = 0
    while (queue.length > 0) {
      if (++requests > MAX_TREE_REQUESTS)
        return sourceLimitRejection(`The Skill folder needs more than ${MAX_TREE_REQUESTS} tree reads.`)
      const current = queue.shift()!
      const response = await getTree(owner, repository, current.sha, false)
      if (response._tag === 'too-large' || (response._tag === 'ok' && response.value.truncated))
        return sourceLimitRejection('GitHub returned an incomplete Skill tree.')
      if (response._tag !== 'ok')
        return readRejection(response)
      for (const entry of response.value.tree) {
        const path = current.prefix ? `${current.prefix}/${entry.path}` : entry.path
        const nested = { ...entry, path }
        entries.push(nested)
        if (entries.length > MAX_TREE_ENTRIES)
          return sourceLimitRejection(`The Skill folder has more than ${MAX_TREE_ENTRIES} entries.`)
        if (entry.type === 'tree')
          queue.push({ sha: entry.sha, prefix: path })
      }
    }
    return { _tag: 'listed', entries, truncated: true }
  }

  const findTreeAtPath = async (
    owner: string,
    repository: string,
    rootTreeSha: string,
    skillPath: string,
  ): Promise<string | SourceRejection> => {
    if (skillPath === '.')
      return rootTreeSha
    let currentSha = rootTreeSha
    for (const segment of skillPath.split('/')) {
      const response = await getTree(owner, repository, currentSha, false)
      if (response._tag !== 'ok')
        return readRejection(response)
      const entry = response.value.tree.find(candidate => candidate.path === segment)
      if (!entry)
        return reject('SOURCE_NOT_FOUND', 'The Skill path does not exist.', [skillPath])
      if (entry.type !== 'tree' || entry.mode !== '040000')
        return reject('INVALID_SOURCE', 'The Skill path is not a directory.', [skillPath])
      currentSha = entry.sha
    }
    return currentSha
  }

  /**
   * The folder of the Skill a name selects, searched across the whole
   * Repository.
   *
   * The search reads one recursive tree and loads nothing, so the Skill
   * limits do not apply to it. It used to read the tree through
   * `listTreeBounded`, whose 2,000 entry ceiling is a limit for one Skill:
   * every Repository larger than that failed with INVALID_SOURCE, whatever
   * the Skill size. Measured 2026-10-07: github/awesome-copilot (3,958
   * entries), garrytan/gstack (3,398), heygen-com/hyperframes (10,342).
   *
   * Copies of one Skill in several folders resolve to the canonical copy.
   * They used to fail as "More than one Skill matched".
   *
   * The registry answers a name it admitted before this search runs, so the
   * search serves names it does not hold, such as a private Skill.
   */
  const resolveNamedSkill = async (
    owner: string,
    repository: string,
    treeSha: string,
    name: string,
  ): Promise<string | SourceRejection> => {
    const folders = await listSkillFolders(owner, repository, treeSha)
    if (folders._tag === 'unlistable') {
      return reject(
        'INVALID_SOURCE',
        'The Repository is too large to find a Skill by name. Name the Skill by its path.',
        [name],
      )
    }
    if (folders._tag === 'rejected')
      return folders
    // The registry lists a Skill by its folder name made into a slug, so
    // `emailAndPassword` runs as `emailandpassword`. An exact folder name
    // still matches for a caller that sends one.
    const matches = folders.folders
      .filter((path) => {
        const folderName = path === '.' ? repository : path.split('/').at(-1)!
        return folderName === name || slugifySkillName(folderName) === name
      })
    return canonicalSkillFolder(matches)
      ?? reject('SOURCE_NOT_FOUND', 'No Skill matched the requested name.', [name])
  }

  /**
   * Every registry Skill folder in a tree, in as few reads as GitHub allows.
   *
   * One recursive read lists most Repositories. GitHub truncates a recursive
   * listing past 100,000 entries or 7 MB, and a large one can pass the 8 MiB
   * read limit: posthog/posthog, n8n-io/n8n, vercel/next.js. Each failed the
   * search outright, whatever the Skill size. A tree that one response cannot
   * hold now splits: one read lists its own level, and each folder in it gets
   * its own recursive read, which can split again.
   *
   * `MAX_NAME_SEARCH_TREE_READS` bounds the walk. Each folder still to visit
   * costs at least one read, so the walk stops as soon as the folders it
   * knows about cannot fit, before it spends reads it cannot finish.
   */
  const listSkillFolders = async (
    owner: string,
    repository: string,
    rootTreeSha: string,
  ): Promise<{ _tag: 'listed', folders: string[] } | { _tag: 'unlistable' } | SourceRejection> => {
    type Visit
      = | { _tag: 'listed', folders: string[], children: Array<{ sha: string, prefix: string }> }
        | { _tag: 'unlistable' }
        | SourceRejection
    let requests = 0
    const read = (sha: string, recursive: boolean) => {
      requests++
      return getTree(owner, repository, sha, recursive)
    }
    const visit = async ({ sha, prefix }: { sha: string, prefix: string }): Promise<Visit> => {
      const join = (path: string) => prefix ? `${prefix}/${path}` : path
      const whole = await read(sha, true)
      if (whole._tag === 'ok' && !whole.value.truncated)
        return { _tag: 'listed', folders: skillFolders(whole.value.tree.map(entry => ({ ...entry, path: join(entry.path) }))), children: [] }
      if (whole._tag !== 'ok' && whole._tag !== 'too-large')
        return readRejection(whole)
      const level = await read(sha, false)
      if (level._tag === 'too-large' || (level._tag === 'ok' && level.value.truncated))
        return { _tag: 'unlistable' }
      if (level._tag !== 'ok')
        return readRejection(level)
      const entries = level.value.tree.map(entry => ({ ...entry, path: join(entry.path) }))
      return {
        _tag: 'listed',
        folders: skillFolders(entries),
        children: entries.filter(entry => entry.type === 'tree').map(entry => ({ sha: entry.sha, prefix: entry.path })),
      }
    }

    const folders: string[] = []
    const pending = [{ sha: rootTreeSha, prefix: '' }]
    while (pending.length > 0) {
      // A split folder costs a second read, so the wave adds its own size once more.
      if (requests + pending.length + Math.min(pending.length, TREE_WALK_CONCURRENCY) > MAX_NAME_SEARCH_TREE_READS)
        return { _tag: 'unlistable' }
      const wave = pending.splice(0, TREE_WALK_CONCURRENCY)
      const visited = await Promise.all(wave.map(visit))
      for (const result of visited) {
        if (result._tag !== 'listed')
          return result
        folders.push(...result.folders)
        pending.push(...result.children)
      }
    }
    return { _tag: 'listed', folders }
  }

  return {
    async resolve(request) {
      const normalizedPath = request.selector.type === 'path'
        ? normalizeRequestedSkillPath(request.selector.path)
        : null
      if (request.selector.type === 'path' && !normalizedPath) {
        return reject('INVALID_SOURCE', 'The Skill path is invalid.', [request.selector.path])
      }
      const repository = await requestJson(
        'repository',
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repository)}`,
        repositoryResponseSchema,
      )
      if (repository._tag === 'rate-limited')
        return rateLimitRejection(repository.resetAt)
      if (repository._tag === 'not-found')
        return reject('SOURCE_NOT_FOUND', 'The Repository was not found.', [])
      if (repository._tag === 'access-denied') {
        return expectedVisibility === 'private'
          ? reject('SOURCE_NOT_FOUND', 'The Repository was not found.', [])
          : reject('SOURCE_ACCESS_DENIED', 'GitHub denied access to the Repository.', [])
      }
      if (repository._tag === 'too-large')
        return readRejection(repository)
      if (repository.value.private !== (expectedVisibility === 'private')) {
        return expectedVisibility === 'private'
          ? reject('SOURCE_NOT_FOUND', 'The Repository was not found.', [])
          : reject('SOURCE_ACCESS_DENIED', 'This endpoint accepts public Repositories only.', [])
      }

      const requestedCommit = !request.ref || request.ref.type === 'branch' || request.ref.type === 'tag'
        ? await resolveGitRefCommit(
            repository.value.owner.login,
            repository.value.name,
            request.ref?.type ?? 'branch',
            request.ref?.value ?? repository.value.default_branch,
          )
        : request.ref.value
      if (typeof requestedCommit !== 'string')
        return requestedCommit
      // A commit is keyed by Repository ID, so it proves the commit exists in
      // this Repository, whatever its name is now.
      const commit = await requestImmutableJson(
        `${repository.value.id}:commit:${requestedCommit}`,
        'commit',
        `/repos/${encodeURIComponent(repository.value.owner.login)}/${encodeURIComponent(repository.value.name)}/commits/${requestedCommit}`,
        commitResponseSchema,
      )
      if (commit._tag === 'rate-limited')
        return rateLimitRejection(commit.resetAt)
      if (commit._tag === 'not-found')
        return reject('SOURCE_NOT_FOUND', 'The requested Git reference was not found.', [request.ref?.value ?? repository.value.default_branch])
      if (commit._tag === 'access-denied')
        return reject('SOURCE_ACCESS_DENIED', 'GitHub denied access to the requested Git reference.', [])
      if (commit._tag === 'too-large')
        return readRejection(commit)
      if (commit.value.sha !== requestedCommit) {
        return reject('INVALID_SOURCE', 'GitHub returned another commit identity.', [
          requestedCommit,
          commit.value.sha,
        ])
      }

      const skillPath = request.selector.type === 'path'
        ? normalizedPath!
        : await resolveNamedSkill(
            repository.value.owner.login,
            repository.value.name,
            commit.value.commit.tree.sha,
            request.selector.name,
          )
      if (typeof skillPath !== 'string')
        return skillPath

      // A moved Repository keeps the name the request used. GitHub confirmed
      // that the name leads to this Repository ID, and the released CLI
      // checks the attested name against its own request.
      const moved = !sameGithubName(request.owner, repository.value.owner.login)
        || !sameGithubName(request.repository, repository.value.name)
      return {
        _tag: 'resolved',
        source: {
          provider: 'github',
          repositoryId: repository.value.id,
          owner: moved ? request.owner : repository.value.owner.login,
          repository: moved ? request.repository : repository.value.name,
          visibility: expectedVisibility,
          commitSha: commit.value.sha,
          treeSha: commit.value.commit.tree.sha,
          skillPath,
        },
      }
    },

    async load(source) {
      const repository = await requestJson(
        'repository',
        `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}`,
        repositoryResponseSchema,
      )
      if (repository._tag === 'rate-limited')
        return rateLimitRejection(repository.resetAt)
      if (repository._tag === 'not-found')
        return reject('SOURCE_NOT_FOUND', 'The Repository was not found.', [])
      if (repository._tag === 'access-denied') {
        return expectedVisibility === 'private'
          ? reject('SOURCE_NOT_FOUND', 'The Repository was not found.', [])
          : reject('SOURCE_ACCESS_DENIED', 'This Artifact source is no longer public.', [])
      }
      if (repository._tag === 'too-large')
        return readRejection(repository)
      if (repository.value.private !== (expectedVisibility === 'private'))
        return reject('SOURCE_ACCESS_DENIED', 'The Repository visibility changed.', [])
      // The Repository ID is the identity. A name can move while the build
      // runs, or after a reused build recorded it, and the commit and tree
      // digests still pin every byte.
      if (repository.value.id !== source.repositoryId)
        return reject('INVALID_SOURCE', 'The Repository identity changed during Artifact creation.', [])
      // Every later read uses the current name, so none of them redirects.
      const at: RepositoryName = { owner: repository.value.owner.login, repository: repository.value.name }
      const skillTree = await findTreeAtPath(at.owner, at.repository, source.treeSha, source.skillPath)
      if (typeof skillTree !== 'string')
        return skillTree
      const listed = await listTreeBounded(at.owner, at.repository, skillTree)
      if (listed._tag !== 'listed')
        return listed
      const selected = selectArtifactEntries(listed.entries, source.skillPath)
      if (selected._tag === 'rejected')
        return selected
      const omitted = selected.omitted.map(entry => ({
        path: entry.path,
        bytes: entry.size,
        url: githubBlobUrl(source, entry.path),
      }))

      const choice = chooseArtifactByteSource({
        visibility: source.visibility,
        treeTruncated: listed.truncated,
        totalBlobBytes: selected.entries.reduce((total, entry) => total + entry.size, 0),
      })
      if (choice._tag === 'tarball') {
        const extracted = await loadFromTarball(source, at, selected.entries)
        if (extracted._tag === 'extracted')
          return { _tag: 'loaded', value: { source, files: extracted.files, omitted } }
        // The tarball is an optimisation, never an authority. Anything it got
        // wrong, including a file `.gitattributes export-ignore` removed from
        // the archive, falls through to the blobs API, which serves every blob
        // the tree names whatever the Repository's export attributes say.
        console.warn('Artifact tarball source unusable, reading blobs', {
          owner: source.owner,
          repository: source.repository,
          commitSha: source.commitSha,
          skillPath: source.skillPath,
          reason: extracted.reason,
          findings: extracted.findings.slice(0, 20),
        })
      }
      const fromBlobs = await loadFromBlobs(source, at, selected.entries)
      return fromBlobs._tag === 'loaded' ? { _tag: 'loaded', value: { source, files: fromBlobs.files, omitted } } : fromBlobs
    },
  }

  async function loadFromTarball(
    source: ResolvedSource,
    at: RepositoryName,
    entries: Array<TreeEntry & { size: number }>,
  ): Promise<TarballExtraction> {
    const headers = new Headers({
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skilld.dev',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    })
    if (options.token)
      headers.set('Authorization', `Bearer ${options.token}`)
    // This request redirects to codeload, so unlike every JSON read it follows
    // redirects. The bytes it returns are verified against the tree digests,
    // which is what makes an unauthenticated byte host acceptable.
    const response = await options.fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(at.owner)}/${encodeURIComponent(at.repository)}/tarball/${source.commitSha}`,
      { headers, redirect: 'follow', signal: AbortSignal.timeout(TARBALL_REQUEST_TIMEOUT_MS) },
    ).catch((thrown: unknown) => {
      // A refused connection or the request timeout lands here. The build has
      // a complete second source, so it reports the reason and reads blobs.
      return { _tag: 'threw' as const, message: String(thrown) }
    })
    if ('_tag' in response)
      return { _tag: 'unusable', reason: 'unavailable', findings: [response.message] }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return { _tag: 'unusable', reason: 'unavailable', findings: [`GitHub returned ${response.status}`] }
    }
    return await extractSkillFilesFromTarball({
      body: response.body,
      skillPath: source.skillPath,
      entries: entries.map(entry => ({
        path: entry.path,
        gitBlobSha: entry.sha,
        size: entry.size,
        mode: artifactFileMode(entry.mode),
      })),
      maxUncompressedBytes: TARBALL_MAX_UNCOMPRESSED_BYTES,
    })
  }

  async function loadFromBlobs(
    source: ResolvedSource,
    at: RepositoryName,
    entries: Array<TreeEntry & { size: number }>,
  ): Promise<{ _tag: 'loaded', files: ArtifactSourceFile[] } | SourceRejection> {
    const files: ArtifactSourceFile[] = []
    for (let offset = 0; offset < entries.length; offset += 8) {
      const batch = entries.slice(offset, offset + 8)
      const loaded = await Promise.all(batch.map(async (entry): Promise<ArtifactSourceFile | SourceRejection> => {
        const response = await requestJson(
          'blob',
          `/repos/${encodeURIComponent(at.owner)}/${encodeURIComponent(at.repository)}/git/blobs/${entry.sha}`,
          blobResponseSchema,
        )
        if (response._tag !== 'ok')
          return readRejection(response)
        const content = base64ToBytes(response.value.content.replaceAll('\n', ''))
        if (response.value.sha !== entry.sha || response.value.size !== content.byteLength || entry.size !== content.byteLength) {
          return reject('INVALID_SOURCE', 'A Git blob changed during Artifact creation.', [entry.path])
        }
        const gitSha = await gitBlobShaHex(content)
        if (gitSha !== entry.sha)
          return reject('INVALID_SOURCE', 'A Git blob failed its Git digest check.', [entry.path])
        return {
          path: entry.path,
          mode: artifactFileMode(entry.mode),
          bytes: content,
          gitBlobSha: entry.sha,
        }
      }))
      const rejected = loaded.find(isSourceRejection)
      if (rejected)
        return rejected
      files.push(...loaded.filter((item): item is ArtifactSourceFile => !isSourceRejection(item)))
    }
    return { _tag: 'loaded', files }
  }
}

export type ArtifactByteSource
  = { _tag: 'tarball' }
    | { _tag: 'per-blob', reason: 'private-repository' | 'tree-truncated' | 'tree-too-large' }

/**
 * Chooses the byte source from the one tree read the build already makes.
 *
 * A private Repository keeps the per-blob path. Its archive URL is a
 * pre-signed codeload link that expires five minutes after it is issued, and
 * GitHub does not document whether credentials belong on the redirected host.
 * Workers `fetch` follows that cross-host redirect itself, so neither question
 * has an answer we control or have observed. Public delivery is measured;
 * private delivery waits for a real test.
 *
 * A truncated tree means the Repository is large enough that GitHub would not
 * list it in one response, which is the same Repository whose archive is
 * expensive to stream. Nothing here reads `content-length`: codeload omits it
 * whenever the archive is generated cold, so it cannot gate anything.
 */
export function chooseArtifactByteSource(input: {
  visibility: 'public' | 'private'
  treeTruncated: boolean
  totalBlobBytes: number
}): ArtifactByteSource {
  if (input.visibility !== 'public')
    return { _tag: 'per-blob', reason: 'private-repository' }
  if (input.treeTruncated)
    return { _tag: 'per-blob', reason: 'tree-truncated' }
  if (input.totalBlobBytes > TARBALL_MAX_TREE_BYTES)
    return { _tag: 'per-blob', reason: 'tree-too-large' }
  return { _tag: 'tarball' }
}

/**
 * The Artifact file mode, read from the Git tree entry.
 *
 * A GitHub tarball widens every mode to 0664 or 0775, so the tree is the only
 * place the executable bit survives.
 */
function artifactFileMode(treeMode: string): 420 | 493 {
  return treeMode === '100755' ? 493 : 420
}

/** The folder of every registry SKILL.md among tree entries, with `.` for the root. */
function skillFolders(entries: TreeEntry[]): string[] {
  return entries
    .filter(entry => entry.type === 'blob' && isRegistrySkillPath(entry.path))
    .map(entry => entry.path === 'SKILL.md' ? '.' : entry.path.slice(0, -'/SKILL.md'.length))
}

/** GitHub owner and Repository names match without case. */
function sameGithubName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function normalizeRequestedSkillPath(input: string): string | null {
  const path = input.normalize('NFC')
  if (path === '.')
    return path
  if (path !== input || path.startsWith('/') || path.endsWith('/') || path.includes('\\') || path.includes('\0'))
    return null
  const segments = path.split('/')
  if (segments.length > MAX_SKILL_PATH_SEGMENTS || segments.some(segment => !isSafePathSegment(segment)))
    return null
  return path
}

type SizedEntry = TreeEntry & { size: number }

/**
 * The blobs one Skill folder packs, the files it leaves out, or the rule that
 * refuses them.
 *
 * Every limit counts the Skill folder only. A file the Skill does not read,
 * such as music, video, an image, a binary, or a file in an example or test
 * folder, is left out when it is over a limit, and the rest of the Skill is
 * delivered: first each such file over the one-file limit, then the largest of
 * them until the folder fits. Only the files a Skill reads decide a refusal. A
 * Skill at the Repository root has the whole Repository as its folder, so its
 * README images are left out rather than counted against it.
 */
function selectArtifactEntries(entries: TreeEntry[], skillPath: string): { _tag: 'selected', entries: SizedEntry[], omitted: SizedEntry[] } | SourceRejection {
  const findings: string[] = []
  const identities = new Map<string, string>()
  const blobs: Array<TreeEntry & { size: number }> = []
  for (const entry of entries) {
    if (!isSafeArtifactPath(entry.path))
      findings.push(entry.path)
    const identity = entry.path.normalize('NFC').toLowerCase()
    const collision = identities.get(identity)
    if (collision && collision !== entry.path)
      findings.push(`${collision} collides with ${entry.path}`)
    else
      identities.set(identity, entry.path)

    if (entry.type === 'commit' || entry.mode === '160000')
      findings.push(`${entry.path} is a Git submodule`)
    if (entry.type === 'blob' && entry.mode === '120000')
      findings.push(`${entry.path} is a symbolic link`)
    if (entry.type === 'blob' && entry.mode !== '100644' && entry.mode !== '100755' && entry.mode !== '120000')
      findings.push(`${entry.path} has unsupported mode ${entry.mode}`)
    if (entry.type === 'blob' && (entry.mode === '100644' || entry.mode === '100755')) {
      if (entry.size === undefined)
        findings.push(`${entry.path} has no declared size`)
      else
        blobs.push({ ...entry, size: entry.size })
    }
  }
  if (findings.length > 0)
    return reject('INVALID_SOURCE', 'The Skill source layout was rejected.', findings.slice(0, 100))
  if (!blobs.some(entry => entry.path === 'SKILL.md'))
    return reject('INVALID_SOURCE', 'The Skill directory has no SKILL.md file.', ['SKILL.md'])
  const rootNote = skillPath === '.'
    ? ' The Skill folder is the Repository root, so every file in the Repository counts.'
    : ''
  if (blobs.length > MAX_ARTIFACT_FILES)
    return sourceLimitRejection(`${skillFolderLabel(skillPath)} has ${blobs.length} files. The limit is ${MAX_ARTIFACT_FILES}.`)
  const oversizedText = blobs.filter(entry => entry.size > MAX_FILE_BYTES && isReadBySkill(entry.path))
  if (oversizedText.length > 0) {
    return sourceLimitRejection(
      `The file \`${oversizedText[0]!.path}\` is ${mebibytes(oversizedText[0]!.size)}. The limit for one file is ${mebibytes(MAX_FILE_BYTES)}.${rootNote}`,
      oversizedText.map(entry => `${entry.path}: ${entry.size.toLocaleString('en-US')} bytes`),
    )
  }
  const omitted = blobs.filter(entry => entry.size > MAX_FILE_BYTES)
  const kept = blobs.filter(entry => entry.size <= MAX_FILE_BYTES)
  // Largest first, so the fewest files go. The path breaks ties, so one
  // commit always omits the same files.
  for (const media of largestFirst(kept.filter(entry => !isReadBySkill(entry.path)))) {
    if (projectedUstarBytes(kept.map(entry => entry.size)) <= MAX_ARTIFACT_BYTES)
      break
    kept.splice(kept.indexOf(media), 1)
    omitted.push(media)
  }
  // The signer checks `content_bytes` against this same ceiling, and
  // `content_bytes` is the packed archive rather than the sum of the blobs. A
  // Skill that cleared a source-total check could therefore be refused after
  // the R2 write, with the signer's error instead of a named rejection. Guard
  // the number the signer will actually see.
  const projectedBytes = projectedUstarBytes(kept.map(entry => entry.size))
  if (projectedBytes > MAX_ARTIFACT_BYTES) {
    return sourceLimitRejection(
      `The files the Skill reads in ${skillFolderLabel(skillPath).replace(/^The /, 'the ')} pack to ${mebibytes(projectedBytes)}. The limit is ${mebibytes(MAX_ARTIFACT_BYTES)}.${rootNote}`,
      largestFirst(kept).map(entry => `${entry.path}: ${entry.size.toLocaleString('en-US')} bytes`),
    )
  }
  return {
    _tag: 'selected',
    entries: kept.sort((a, b) => comparePath(a.path, b.path)),
    omitted: omitted.sort((a, b) => comparePath(a.path, b.path)),
  }
}

/**
 * File names a Skill reads as text. Anything else over a size limit, such as
 * an image, audio, video, an archive or a binary, can be left out.
 */
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  'adoc',
  'bash',
  'bat',
  'bib',
  'c',
  'cc',
  'cfg',
  'cjs',
  'conf',
  'cpp',
  'cs',
  'css',
  'csv',
  'cts',
  'dart',
  'env',
  'fish',
  'go',
  'gql',
  'graphql',
  'h',
  'hpp',
  'htm',
  'html',
  'ini',
  'ipynb',
  'java',
  'js',
  'json',
  'json5',
  'jsonc',
  'jsonl',
  'jsx',
  'kt',
  'less',
  'lua',
  'markdown',
  'md',
  'mdc',
  'mdx',
  'mjs',
  'mts',
  'php',
  'pl',
  'prompt',
  'properties',
  'ps1',
  'py',
  'r',
  'rb',
  'rs',
  'rst',
  'sass',
  'scss',
  'sh',
  'sql',
  'svelte',
  'swift',
  'tex',
  'toml',
  'ts',
  'tsv',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zsh',
])
const TEXT_FILE_NAMES: ReadonlySet<string> = new Set([
  'dockerfile',
  'gemfile',
  'license',
  'makefile',
  'procfile',
  'readme',
])

/**
 * Folders of sample output and tests. A Skill runs its scripts and reads its
 * references; it does not read these. tt-a1i/archify keeps five rendered
 * examples of about 760 KB each in `examples/`.
 */
const NOT_READ_FOLDERS: ReadonlySet<string> = new Set([
  '__fixtures__',
  '__tests__',
  'example',
  'examples',
  'fixtures',
  'sample',
  'samples',
  'test',
  'tests',
])

/** True for SKILL.md and for a text file outside the example and test folders. */
function isReadBySkill(path: string): boolean {
  if (path === 'SKILL.md')
    return true
  const segments = path.split('/')
  if (segments.slice(0, -1).some(segment => NOT_READ_FOLDERS.has(segment.toLowerCase())))
    return false
  const name = segments.at(-1)!.toLowerCase()
  if (TEXT_FILE_NAMES.has(name))
    return true
  const dot = name.lastIndexOf('.')
  return dot > 0 && TEXT_EXTENSIONS.has(name.slice(dot + 1))
}

/** The GitHub page of one Skill file at the Artifact's commit. */
function githubBlobUrl(source: ResolvedSource, path: string): string {
  const repositoryPath = source.skillPath === '.' ? path : `${source.skillPath}/${path}`
  return `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/blob/${source.commitSha}/${repositoryPath.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Whether files read back from a stored Artifact pass every rule a GitHub load
 * applies today, and the load would leave none of them out. A Skill checked
 * again from its stored bytes then packs exactly what a load would pack.
 */
export function storedFilesPassLoadRules(files: ArtifactSourceFile[], skillPath: string): boolean {
  const entries = files.map(file => ({
    path: file.path,
    mode: file.mode === 493 ? '100755' : '100644',
    type: 'blob' as const,
    sha: file.gitBlobSha,
    size: file.bytes.byteLength,
  }))
  const selected = selectArtifactEntries(entries, skillPath)
  return selected._tag === 'selected' && selected.omitted.length === 0
}

function skillFolderLabel(skillPath: string): string {
  return skillPath === '.' ? 'The Skill folder' : `The Skill folder \`${skillPath}\``
}

/**
 * Bytes as mebibytes, rounded up to two decimals so a size over a limit never
 * prints equal to it. A whole number prints without decimals.
 */
function mebibytes(bytes: number): string {
  const value = Math.ceil(bytes / 1024 / 1024 * 100) / 100
  return `${Number.isInteger(value) ? value : value.toFixed(2)} MiB`
}

function largestFirst(entries: SizedEntry[]): SizedEntry[] {
  return [...entries].sort((a, b) => b.size - a.size || comparePath(a.path, b.path))
}

function isSafeArtifactPath(path: string): boolean {
  if (!path || path.length > 1024 || path.startsWith('/') || path.endsWith('/') || path.includes('\\') || path.includes('\0'))
    return false
  if (path.normalize('NFC') !== path)
    return false
  return path.split('/').every(isSafePathSegment)
}

function isSafePathSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..' || /[<>:"|?*]/.test(segment) || hasControlCharacter(segment))
    return false
  if (segment.endsWith('.') || segment.endsWith(' '))
    return false
  const windowsName = segment.split('.')[0]!.toUpperCase()
  return !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsName)
}

function hasControlCharacter(value: string): boolean {
  return [...value].some(character => character.charCodeAt(0) <= 0x1F)
}

function comparePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<{ _tag: 'json', value: unknown } | { _tag: 'too-large' }> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => {
      // The declared size already decided the outcome. A body that will not close changes nothing.
    })
    return { _tag: 'too-large' }
  }
  if (!response.body)
    throw new Error('GitHub returned an empty response')
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
      return { _tag: 'too-large' }
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { _tag: 'json', value: JSON.parse(new TextDecoder().decode(bytes)) as unknown }
}

/**
 * The API URL a moved Repository answers with, or null for any other redirect.
 *
 * Only `/repositories/<id>` on the API origin passes, so the token never
 * leaves api.github.com and no redirect reads an arbitrary path.
 */
function movedRepositoryUrl(location: string | null): string | null {
  if (!location)
    return null
  const url = URL.parse(location, GITHUB_API)
  if (!url || url.origin !== GITHUB_API || url.username || url.password)
    return null
  return /^\/repositories\/[1-9]\d*(?:\/|$)/.test(url.pathname) ? url.href : null
}

function sourceReadRejection(
  reason: 'not-found' | 'access-denied' | 'identity-mismatch' | 'too-large',
  visibility: 'public' | 'private',
): SourceRejection {
  if (visibility === 'private' && (reason === 'not-found' || reason === 'access-denied'))
    return reject('SOURCE_NOT_FOUND', 'The Repository was not found.', [])
  if (reason === 'not-found')
    return reject('SOURCE_NOT_FOUND', 'The Git object was not found.', [])
  if (reason === 'access-denied')
    return reject('SOURCE_ACCESS_DENIED', 'GitHub denied access to the Git object.', [])
  if (reason === 'too-large')
    return reject('INVALID_SOURCE', 'The GitHub response is larger than the read limit.', [])
  return reject('INVALID_SOURCE', 'GitHub returned another Git object identity.', [])
}

function sourceLimitRejection(summary: string, findings: string[] = []): SourceRejection {
  return reject('INVALID_SOURCE', summary, findings)
}

type FailedReadOutcome
  = { _tag: 'not-found' | 'access-denied' | 'identity-mismatch' | 'too-large' }
    | { _tag: 'rate-limited', resetAt: number | null }

/** One GitHub JSON read that reached an answer. A failed path to GitHub throws instead. */
type ReadOutcome<T>
  = | { _tag: 'ok', value: T }
    | { _tag: 'not-found' }
    | { _tag: 'access-denied' }
    | { _tag: 'rate-limited', resetAt: number | null }
    /** The body passed `MAX_GITHUB_JSON_BYTES`. A retry gets the same body. */
    | { _tag: 'too-large' }

function epochHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name)
  if (raw === null)
    return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function rateLimitRejection(resetAt: number | null): SourceRejection {
  const rejection = reject('RATE_LIMITED', 'GitHub refused the read: its rate limit is spent.', [])
  return resetAt === null ? rejection : { ...rejection, retryAfterSeconds: resetAt }
}

/**
 * Whether a later attempt at the same request could answer differently.
 *
 * A spent quota, an unreachable upstream and an unavailable signer all pass.
 * Every verdict about the Repository itself does not: retrying reaches the
 * same answer and spends the budget to learn nothing.
 */
export function isRetryableProblem(code: ProblemCode): boolean {
  return code === 'RATE_LIMITED'
    || code === 'SOURCE_UNAVAILABLE'
    || code === 'SERVICE_UNAVAILABLE'
    || code === 'SIGNER_UNAVAILABLE'
    || code === 'CHECK_UNAVAILABLE'
}

function reject(code: ProblemCode, summary: string, findings: string[]): SourceRejection {
  return {
    _tag: 'rejected',
    code,
    summary: summary.slice(0, 500),
    findings: findings.slice(0, 100).map(finding => finding.slice(0, 500)),
  }
}

function isSourceRejection(value: ArtifactSourceFile | SourceRejection): value is SourceRejection {
  return '_tag' in value && value._tag === 'rejected'
}
