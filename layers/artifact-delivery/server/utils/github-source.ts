import type { ProblemCode, ResolvedSource, SourceRequest } from '../schemas/contracts'
import { z } from 'zod'
import { base64ToBytes, digestHex } from './encoding'

const GITHUB_API = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'
const MAX_GITHUB_JSON_BYTES = 8 * 1024 * 1024
const MAX_TREE_ENTRIES = 2000
const MAX_TREE_REQUESTS = 128
const MAX_SKILL_PATH_SEGMENTS = 64
const MAX_ARTIFACT_FILES = 256
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024
const GITHUB_REQUEST_TIMEOUT_MS = 15_000

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

interface GithubClientOptions {
  fetch: typeof globalThis.fetch
  token?: string
  visibility?: 'public' | 'private'
}

export function createPublicGithubSourceClient(options: GithubClientOptions): PublicGithubSourceClient {
  return createGithubSourceClient({ ...options, visibility: 'public' })
}

export function createGithubSourceClient(options: GithubClientOptions): PublicGithubSourceClient {
  const expectedVisibility = options.visibility ?? 'public'
  const readRejection = (reason: 'not-found' | 'access-denied' | 'identity-mismatch') =>
    sourceReadRejection(reason, expectedVisibility)
  const requestJson = async <T>(path: string, schema: z.ZodType<T>): Promise<
    { _tag: 'ok', value: T }
    | { _tag: 'not-found' }
    | { _tag: 'access-denied' }
  > => {
    const headers = new Headers({
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skilld.dev',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    })
    if (options.token)
      headers.set('Authorization', `Bearer ${options.token}`)
    const response = await options.fetch(`${GITHUB_API}${path}`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    })
    if (response.status === 404)
      return { _tag: 'not-found' }
    if (response.status === 401 || response.status === 403) {
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
        throw new Error('GitHub rate limit reached')
      return { _tag: 'access-denied' }
    }
    if (!response.ok)
      throw new Error(`GitHub returned ${response.status}`)
    const body = await readBoundedJson(response, MAX_GITHUB_JSON_BYTES)
    const parsed = schema.safeParse(body)
    if (!parsed.success)
      throw new Error('GitHub returned an invalid response')
    return { _tag: 'ok', value: parsed.data }
  }

  const getTree = async (owner: string, repository: string, sha: string, recursive: boolean) => {
    const suffix = recursive ? '?recursive=1' : ''
    const response = await requestJson(
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
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/ref/${namespace}/${encodeURIComponent(value)}`,
      gitRefResponseSchema,
    )
    if (gitRef._tag !== 'ok')
      return readRejection(gitRef._tag)
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
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/tags/${object.sha}`,
        annotatedTagResponseSchema,
      )
      if (tag._tag !== 'ok')
        return readRejection(tag._tag)
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
  ): Promise<TreeEntry[] | SourceRejection> => {
    const recursive = await getTree(owner, repository, rootTreeSha, true)
    if (recursive._tag !== 'ok')
      return readRejection(recursive._tag)
    if (!recursive.value.truncated) {
      if (recursive.value.tree.length > MAX_TREE_ENTRIES)
        return sourceLimitRejection(`The Skill has more than ${MAX_TREE_ENTRIES} source entries.`)
      return recursive.value.tree
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
        return readRejection(response._tag)
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
    return entries
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
        return readRejection(response._tag)
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
    if (!Array.isArray(tree))
      return tree
    const matches = tree
      .filter(entry => entry.type === 'blob' && (entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md')))
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
        `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repository)}`,
        repositoryResponseSchema,
      )
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
        `/repos/${encodeURIComponent(repository.value.owner.login)}/${encodeURIComponent(repository.value.name)}/commits/${requestedCommit}`,
        commitResponseSchema,
      )
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
        `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}`,
        repositoryResponseSchema,
      )
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
      if (!Array.isArray(listed))
        return listed
      const selected = selectArtifactEntries(listed)
      if (selected._tag === 'rejected')
        return selected

      const files: ArtifactSourceFile[] = []
      for (let offset = 0; offset < selected.entries.length; offset += 8) {
        const batch = selected.entries.slice(offset, offset + 8)
        const loaded = await Promise.all(batch.map(async (entry): Promise<ArtifactSourceFile | SourceRejection> => {
          const response = await requestJson(
            `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/git/blobs/${entry.sha}`,
            blobResponseSchema,
          )
          if (response._tag !== 'ok')
            return readRejection(response._tag)
          const content = base64ToBytes(response.value.content.replaceAll('\n', ''))
          if (response.value.sha !== entry.sha || response.value.size !== content.byteLength || entry.size !== content.byteLength) {
            return reject('INVALID_SOURCE', 'A Git blob changed during Artifact creation.', [entry.path])
          }
          const gitSha = await gitBlobSha(content)
          if (gitSha !== entry.sha)
            return reject('INVALID_SOURCE', 'A Git blob failed its Git digest check.', [entry.path])
          return {
            path: entry.path,
            mode: entry.mode === '100755' ? 493 : 420,
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
    },
  }
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
  const totalBytes = blobs.reduce((total, entry) => total + entry.size, 0)
  if (totalBytes > MAX_ARTIFACT_BYTES)
    return sourceLimitRejection(`The Skill exceeds ${MAX_ARTIFACT_BYTES} bytes.`)
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

async function gitBlobSha(content: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${content.byteLength}\0`)
  const value = new Uint8Array(header.byteLength + content.byteLength)
  value.set(header)
  value.set(content, header.byteLength)
  return await digestHex('SHA-1', value)
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
