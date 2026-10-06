import type { FetchOutcome, RepoMeta } from '../../../utils/github-client'
import { getDB } from '#server/utils/db'
import { readCache, writeCache } from '#shared/server/cache'
import { isRegistrySkillPath } from '#shared/skill-path'
import { getRepo, getTree, GITHUB_PAGE_READ_TIMEOUT_MS, githubRefused, resolveGithubBindings } from '../../../utils/github-client'
import { resolveRepoSourceIdentityFromRow } from '../../../utils/repo-source-identity'
import { buildUnavailableRepoSourceProfile } from '../../../utils/repo-source-profile'
import { readUnghRepoMeta } from '../../../utils/ungh-repo'

export interface RepoSourceProfile {
  owner: string
  repo: string
  description: string | null
  githubUrl: string
  defaultBranch: string
  stars: number
  forks: number
  pushedAt: string
  createdAt: string
  archived: boolean
  fork: boolean
  skillFileScanStatus: 'ok' | 'unavailable' | 'truncated'
  skillFileCount: number
  skillFiles: string[]
}

interface SkillFileScan {
  status: 'ok' | 'truncated'
  skillFiles: string[]
}

/**
 * How long a repository GitHub could not find answers 404 without asking
 * again. Crawlers retry dead `/gh` links: about 630 such reads a day each
 * spent one request of the shared `GITHUB_TOKEN` quota (2026-10-06).
 */
const MISSING_REPO_TTL_SECONDS = 60 * 60

/** A tree SHA names immutable content, so its scan can live as long as the cache keeps it. */
const TREE_SCAN_TTL_SECONDS = 7 * 24 * 60 * 60

function githubReadFailed(operation: string, error: unknown): FetchOutcome<never> {
  emitOperationalEvent(createWideEvent({
    operation,
    outcome: 'failed',
    reason: error instanceof Error ? error.message : String(error),
  }))
  return { status: 0, data: null, rateLimit: null, notModified: false }
}

function missingRepoKey(owner: string, repo: string): string {
  return `repo-source-missing:v1:${owner}/${repo}`
}

function treeScanKey(owner: string, repo: string, treeSha: string): string {
  return `repo-source-tree:v1:${owner}/${repo}/${treeSha}`
}

function scanTree(tree: { truncated?: boolean, tree: Array<{ path: string, type: string }> }): SkillFileScan {
  return {
    status: tree.truncated ? 'truncated' : 'ok',
    skillFiles: tree.tree
      .filter(entry => entry.type === 'blob' && isRegistrySkillPath(entry.path))
      .map(entry => entry.path)
      .sort(),
  }
}

function profileFrom(meta: RepoMeta, scan: SkillFileScan | null): RepoSourceProfile {
  const skillFiles = scan?.skillFiles ?? []
  return {
    owner: meta.owner.login,
    repo: meta.name,
    description: meta.description,
    githubUrl: meta.html_url || `https://github.com/${meta.owner.login}/${meta.name}`,
    defaultBranch: meta.default_branch,
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    pushedAt: meta.pushed_at,
    createdAt: meta.created_at,
    archived: Boolean(meta.archived),
    fork: Boolean(meta.fork),
    skillFileScanStatus: scan?.status ?? 'unavailable',
    skillFileCount: skillFiles.length,
    skillFiles,
  }
}

export default defineCachedEventHandler(async (event) => {
  const ownerParam = getRouterParam(event, 'owner')
  const repoParam = getRouterParam(event, 'repo')
  if (!ownerParam || !repoParam)
    throw createError({ statusCode: 400, message: 'Missing owner or repo parameter' })

  const owner = ownerParam.toLowerCase()
  const repo = repoParam.toLowerCase()
  const edgeCache = useStorage('edge-cache')
  if (await readCache<true>(edgeCache, missingRepoKey(owner, repo)))
    throw createError({ statusCode: 404, message: 'Repository not found' })

  const db = getDB(event)
  const row = await db
    .prepare(`SELECT source_owner, source_repo, last_tree_sha FROM repos WHERE owner = ? AND repo = ?`)
    .bind(owner, repo)
    .first<{ source_owner: string | null, source_repo: string | null, last_tree_sha: string | null }>()
  const source = resolveRepoSourceIdentityFromRow({ owner, repo }, row)
  const bindings = resolveGithubBindings(event.context.platform.env)

  // A read that timed out or dropped is an outage, not a missing repository.
  const repoRes = await getRepo(source.owner, source.repo, bindings, { timeoutMs: GITHUB_PAGE_READ_TIMEOUT_MS })
    .catch((error: unknown) => githubReadFailed('repo-source-profile-repo', error))
  // The token can read private repositories, and this page is public, so a
  // private one answers exactly like one that does not exist.
  if (repoRes.status === 404 || repoRes.data?.private) {
    await writeCache(edgeCache, missingRepoKey(owner, repo), true, { ttl: MISSING_REPO_TTL_SECONDS })
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }
  if (!repoRes.data) {
    emitOperationalEvent(createWideEvent({
      'operation': 'repo-source-profile',
      'outcome': 'unavailable',
      'upstream.status': repoRes.status || null,
    }))
    // Metadata from ungh.cc keeps the page whole while the shared quota is
    // spent. The Skill file list needs the tree, which only GitHub serves.
    if (githubRefused(repoRes)) {
      const fallback = await readUnghRepoMeta(source.owner, source.repo)
      if (fallback._tag === 'found')
        return profileFrom(fallback.meta, null)
      emitOperationalEvent(createWideEvent({ operation: 'repo-source-profile-ungh', outcome: 'unavailable', reason: fallback.reason }))
    }
    return buildUnavailableRepoSourceProfile(owner, repo) satisfies RepoSourceProfile
  }

  const meta = repoRes.data
  // The sync records the tree it last read. Read at that SHA, the listing
  // never changes, so one scan serves every later view. A repository the
  // registry has not synced is read at its default branch.
  const treeSha = row?.last_tree_sha ?? null
  const cachedScan = treeSha
    ? await readCache<SkillFileScan>(edgeCache, treeScanKey(meta.owner.login, meta.name, treeSha))
    : null
  if (cachedScan)
    return profileFrom(meta, cachedScan) satisfies RepoSourceProfile

  const treeRes = await getTree(meta.owner.login, meta.name, treeSha ?? meta.default_branch, bindings, { timeoutMs: GITHUB_PAGE_READ_TIMEOUT_MS })
    .catch((error: unknown) => githubReadFailed('repo-source-profile-tree', error))
  const scan = treeRes.data ? scanTree(treeRes.data) : null
  if (scan && treeSha)
    await writeCache(edgeCache, treeScanKey(meta.owner.login, meta.name, treeSha), scan, { ttl: TREE_SCAN_TTL_SECONDS })
  return profileFrom(meta, scan) satisfies RepoSourceProfile
}, {
  maxAge: 60 * 15,
  swr: true,
  getKey: (event) => {
    const owner = (getRouterParam(event, 'owner') ?? '').toLowerCase()
    const repo = (getRouterParam(event, 'repo') ?? '').toLowerCase()
    return `repo-source:v5:${owner}/${repo}`
  },
})
