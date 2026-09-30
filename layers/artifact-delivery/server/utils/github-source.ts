import type { ProblemCode, ResolvedSource, SourceRequest } from '../schemas/contracts'
import type { GithubReadTry } from './github-read'
import type { TarballExtraction } from './tarball-source'
import { z } from 'zod'
import { isRegistrySkillPath } from '#shared/skill-path'
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

export interface LoadedArtifactSource {
  source: ResolvedSource
  files: ArtifactSourceFile[]
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
  const requestJson = async <T>(step: GithubReadStep, path: string, schema: z.ZodType<T>): Promise<
    { _tag: 'ok', value: T }
    | { _tag: 'not-found' }
    | { _tag: 'access-denied' }
    | { _tag: 'rate-limited', resetAt: number | null }
  > => {
    type Outcome
      = | { _tag: 'ok', value: T }
        | { _tag: 'not-found' }
        | { _tag: 'access-denied' }
        | { _tag: 'rate-limited', resetAt: number | null }
    const headers = new Headers({
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skilld.dev',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    })
    if (options.token)
      headers.set('Authorization', `Bearer ${options.token}`)
    // Every try requests this same URL, so a retry can never read another ref.
    const url = `${GITHUB_API}${path}`
    const tryOnce = async (): Promise<GithubReadTry<Outcome>> => {
      const sent = await fetchNoRedirect(options.fetch, url, {
        headers,
        signal: AbortSignal.timeout(GITHUB_READ_TRY_TIMEOUT_MS),
      }).then(
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
      const body = await readBoundedJson(response, MAX_GITHUB_JSON_BYTES).then(
        value => ({ _tag: 'json' as const, value }),
        (error: unknown) => ({ _tag: 'unreadable' as const, error }),
      )
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

  const getTree = async (owner: string, repository: string, sha: string, recursive: boolean) => {
    const suffix = recursive ? '?recursive=1' : ''
    const response = await requestJson(
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
    if (recursive._tag !== 'ok')
      return readRejection(recursive)
    if (!recursive.value.truncated) {
      if (recursive.value.tree.length > MAX_TREE_ENTRIES)
        return sourceLimitRejection(`The Skill has more than ${MAX_TREE_ENTRIES} source entries.`)
      return { _tag: 'listed', entries: recursive.value.tree, truncated: false }
    }

    const entries: TreeEntry[] = []
    const queue: Array<{ sha: string, prefix: string }> = [{ sha: rootTreeSha, prefix: '' }]
    let requests = 0
    while (queue.length > 0) {
      if (++requests > MAX_TREE_REQUESTS)
        return sourceLimitRejection(`The Skill needs more than ${MAX_TREE_REQUESTS} tree reads.`)
      const current = queue.shift()!
      const response = await getTree(owner, repository, current.sha, false)
      if (response._tag !== 'ok')
        return readRejection(response)
      if (response.value.truncated)
        return sourceLimitRejection('GitHub returned an incomplete Skill tree.')
      for (const entry of response.value.tree) {
        const path = current.prefix ? `${current.prefix}/${entry.path}` : entry.path
        const nested = { ...entry, path }
        entries.push(nested)
        if (entries.length > MAX_TREE_ENTRIES)
          return sourceLimitRejection(`The Skill has more than ${MAX_TREE_ENTRIES} source entries.`)
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

  const resolveNamedSkill = async (
    owner: string,
    repository: string,
    treeSha: string,
    name: string,
  ): Promise<string | SourceRejection> => {
    const tree = await listTreeBounded(owner, repository, treeSha)
    if (tree._tag !== 'listed')
      return tree
    const matches = tree.entries
      .filter(entry => entry.type === 'blob' && isRegistrySkillPath(entry.path))
      .map(entry => entry.path === 'SKILL.md' ? '.' : entry.path.slice(0, -'/SKILL.md'.length))
      .filter(path => (path === '.' ? repository : path.split('/').at(-1)) === name)
    if (matches.length === 0)
      return reject('SOURCE_NOT_FOUND', 'No Skill matched the requested name.', [name])
    if (matches.length > 1)
      return reject('INVALID_SOURCE', 'More than one Skill matched the requested name.', matches.slice(0, 100))
    return matches[0]!
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
      const commit = await requestJson(
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

      return {
        _tag: 'resolved',
        source: {
          provider: 'github',
          repositoryId: repository.value.id,
          owner: repository.value.owner.login,
          repository: repository.value.name,
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
      if (repository.value.private !== (expectedVisibility === 'private'))
        return reject('SOURCE_ACCESS_DENIED', 'The Repository visibility changed.', [])
      if (
        repository.value.id !== source.repositoryId
        || repository.value.owner.login !== source.owner
        || repository.value.name !== source.repository
      ) {
        return reject('INVALID_SOURCE', 'The Repository identity changed during Artifact creation.', [])
      }
      const skillTree = await findTreeAtPath(source.owner, source.repository, source.treeSha, source.skillPath)
      if (typeof skillTree !== 'string')
        return skillTree
      const listed = await listTreeBounded(source.owner, source.repository, skillTree)
      if (listed._tag !== 'listed')
        return listed
      const selected = selectArtifactEntries(listed.entries)
      if (selected._tag === 'rejected')
        return selected

      const choice = chooseArtifactByteSource({
        visibility: source.visibility,
        treeTruncated: listed.truncated,
        totalBlobBytes: selected.entries.reduce((total, entry) => total + entry.size, 0),
      })
      if (choice._tag === 'tarball') {
        const extracted = await loadFromTarball(source, selected.entries)
        if (extracted._tag === 'extracted')
          return { _tag: 'loaded', value: { source, files: extracted.files } }
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
      return await loadFromBlobs(source, selected.entries)
    },
  }

  async function loadFromTarball(
    source: ResolvedSource,
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
      `${GITHUB_API}/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/tarball/${source.commitSha}`,
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
    entries: Array<TreeEntry & { size: number }>,
  ): Promise<LoadSourceResult> {
    const files: ArtifactSourceFile[] = []
    for (let offset = 0; offset < entries.length; offset += 8) {
      const batch = entries.slice(offset, offset + 8)
      const loaded = await Promise.all(batch.map(async (entry): Promise<ArtifactSourceFile | SourceRejection> => {
        const response = await requestJson(
          'blob',
          `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/git/blobs/${entry.sha}`,
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
    return { _tag: 'loaded', value: { source, files } }
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

function selectArtifactEntries(entries: TreeEntry[]): { _tag: 'selected', entries: Array<TreeEntry & { size: number }> } | SourceRejection {
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
  if (blobs.length > MAX_ARTIFACT_FILES)
    return sourceLimitRejection(`The Skill has more than ${MAX_ARTIFACT_FILES} files.`)
  const oversized = blobs.filter(entry => entry.size > MAX_FILE_BYTES)
  if (oversized.length > 0)
    return sourceLimitRejection(`A Skill file exceeds ${MAX_FILE_BYTES} bytes.`, oversized.map(entry => entry.path))
  // The signer checks `content_bytes` against this same ceiling, and
  // `content_bytes` is the packed archive rather than the sum of the blobs. A
  // Skill that cleared a source-total check could therefore be refused after
  // the R2 write, with the signer's error instead of a named rejection. Guard
  // the number the signer will actually see.
  const projectedBytes = projectedUstarBytes(blobs.map(entry => entry.size))
  if (projectedBytes > MAX_ARTIFACT_BYTES)
    return sourceLimitRejection(`The packaged Skill would exceed ${MAX_ARTIFACT_BYTES} bytes.`)
  return { _tag: 'selected', entries: blobs.sort((a, b) => comparePath(a.path, b.path)) }
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

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new Error('GitHub response exceeded the byte limit')
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
      throw new Error('GitHub response exceeded the byte limit')
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function sourceReadRejection(
  reason: 'not-found' | 'access-denied' | 'identity-mismatch',
  visibility: 'public' | 'private',
): SourceRejection {
  if (visibility === 'private' && (reason === 'not-found' || reason === 'access-denied'))
    return reject('SOURCE_NOT_FOUND', 'The Repository was not found.', [])
  if (reason === 'not-found')
    return reject('SOURCE_NOT_FOUND', 'The Git object was not found.', [])
  if (reason === 'access-denied')
    return reject('SOURCE_ACCESS_DENIED', 'GitHub denied access to the Git object.', [])
  return reject('INVALID_SOURCE', 'GitHub returned another Git object identity.', [])
}

function sourceLimitRejection(summary: string, findings: string[] = []): SourceRejection {
  return reject('INVALID_SOURCE', summary, findings)
}

type FailedReadOutcome
  = { _tag: 'not-found' | 'access-denied' | 'identity-mismatch' }
    | { _tag: 'rate-limited', resetAt: number | null }

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
