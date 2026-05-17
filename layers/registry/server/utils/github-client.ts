/// <reference types="@cloudflare/workers-types" />

const API_BASE = 'https://api.github.com'
const GRAPHQL_URL = 'https://api.github.com/graphql'
const RAW_BASE = 'https://raw.githubusercontent.com'

export interface GithubBindings {
  KV_CACHE?: KVNamespace
  GITHUB_TOKEN?: string
}

/**
 * Resolve GitHub bindings from a Cloudflare env (Worker runtime) or process.env (local dev).
 * Pass `cloudflareEnv` from `event.context.cloudflare.env` (handlers) or
 * `(context as any).cloudflare?.env` (Nitro tasks). Falls back to process.env in local dev,
 * since `.env` populates process.env but not the Worker env binding.
 */
export function resolveGithubBindings(cloudflareEnv?: Record<string, unknown>): GithubBindings {
  const env = (cloudflareEnv ?? {}) as Record<string, unknown>
  return {
    KV_CACHE: env.KV_CACHE as KVNamespace | undefined,
    GITHUB_TOKEN: (env.GITHUB_TOKEN as string | undefined) ?? process.env.GITHUB_TOKEN,
  }
}

export interface RepoMeta {
  name: string
  full_name: string
  html_url: string
  owner: {
    login: string
  }
  default_branch: string
  description: string | null
  stargazers_count: number
  forks_count: number
  pushed_at: string
  created_at: string
  archived?: boolean
  fork?: boolean
}

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
}

export interface TreeResponse {
  sha: string
  tree: TreeEntry[]
  truncated?: boolean
}

export interface CommitEntry {
  sha: string
  commit: {
    author: { name?: string, email?: string, date: string }
    message: string
  }
  author?: { login?: string } | null
}

export interface RateLimitInfo {
  remaining: number
  limit: number
  reset: number
}

export interface FetchOutcome<T> {
  status: number
  data: T | null
  rateLimit: RateLimitInfo | null
  notModified: boolean
}

interface CachedEntry<T> {
  etag: string
  body: T
}

const ETAG_PREFIX = 'gh-etag:'
const ETAG_TTL = 60 * 60 * 24 * 7

function etagKey(url: string): string {
  return `${ETAG_PREFIX}${url}`
}

function parseRateLimit(headers: Headers): RateLimitInfo | null {
  const remaining = headers.get('x-ratelimit-remaining')
  if (!remaining)
    return null
  return {
    remaining: Number(remaining),
    limit: Number(headers.get('x-ratelimit-limit') ?? 0),
    reset: Number(headers.get('x-ratelimit-reset') ?? 0),
  }
}

async function ghRequest<T>(
  url: string,
  bindings: GithubBindings,
  init?: RequestInit,
): Promise<FetchOutcome<T>> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('User-Agent', 'skilld.dev')
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  if (bindings.GITHUB_TOKEN)
    headers.set('Authorization', `Bearer ${bindings.GITHUB_TOKEN}`)

  const cacheKey = etagKey(url)
  let cached: CachedEntry<T> | null = null
  if (bindings.KV_CACHE) {
    cached = await bindings.KV_CACHE.get<CachedEntry<T>>(cacheKey, 'json').catch(() => null)
    if (cached?.etag)
      headers.set('If-None-Match', cached.etag)
  }

  const res = await fetch(url, { ...init, headers })
  const rateLimit = parseRateLimit(res.headers)

  if (res.status === 304 && cached) {
    return { status: 304, data: cached.body, rateLimit, notModified: true }
  }

  if (!res.ok) {
    return { status: res.status, data: null, rateLimit, notModified: false }
  }

  const body = (await res.json()) as T
  const newEtag = res.headers.get('etag')
  if (newEtag && bindings.KV_CACHE) {
    await bindings.KV_CACHE
      .put(cacheKey, JSON.stringify({ etag: newEtag, body }), { expirationTtl: ETAG_TTL })
      .catch(err => console.warn('[github-client] etag cache write failed', err))
  }

  return { status: res.status, data: body, rateLimit, notModified: false }
}

export async function getRepo(
  owner: string,
  repo: string,
  bindings: GithubBindings,
): Promise<FetchOutcome<RepoMeta>> {
  return ghRequest<RepoMeta>(`${API_BASE}/repos/${owner}/${repo}`, bindings)
}

interface RepoSummaryGqlResponse {
  repository: {
    description: string | null
    stargazerCount: number
    forkCount: number
    pushedAt: string
    createdAt: string
    isArchived: boolean
    isFork: boolean
    defaultBranchRef: {
      name: string
      target: { oid: string, tree: { oid: string } } | null
    } | null
  } | null
}

export interface RepoSummary {
  meta: RepoMeta
  headTreeSha: string | null
}

/**
 * GraphQL-backed combo of getRepo + head-tree-SHA. One subrequest replaces
 * the REST getRepo (1) and lets sync-repo skip the REST getTree call (1)
 * when last_tree_sha matches. Halves the baseline subrequest count per
 * unchanged repo from 2 → 1, doubling effective MAX_REPOS_PER_RUN capacity.
 *
 * GraphQL primary rate-limit headers mirror REST (x-ratelimit-*) so the
 * caller can read FetchOutcome.rateLimit identically. Errors are mapped to
 * data=null + non-200 status so callers can keep their existing branching.
 */
export async function getRepoSummary(
  owner: string,
  repo: string,
  bindings: GithubBindings,
): Promise<FetchOutcome<RepoSummary>> {
  const query = `query($owner:String!,$repo:String!){
    repository(owner:$owner,name:$repo){
      description stargazerCount forkCount pushedAt createdAt isArchived isFork
      defaultBranchRef{name target{... on Commit{oid tree{oid}}}}
    }
  }`
  const headers = new Headers()
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Content-Type', 'application/json')
  headers.set('User-Agent', 'skilld.dev')
  if (bindings.GITHUB_TOKEN)
    headers.set('Authorization', `Bearer ${bindings.GITHUB_TOKEN}`)

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: { owner, repo } }),
  })
  const rateLimit = parseRateLimit(res.headers)
  if (!res.ok)
    return { status: res.status, data: null, rateLimit, notModified: false }

  const body = await res.json() as { data?: RepoSummaryGqlResponse, errors?: Array<{ type?: string, message?: string }> }
  // GraphQL surfaces NOT_FOUND in errors with HTTP 200. Map it to 404 so
  // callers preserve their existing rate-limit / broken-repo branching.
  if (body.errors?.length) {
    const notFound = body.errors.some(e => e.type === 'NOT_FOUND')
    return { status: notFound ? 404 : 502, data: null, rateLimit, notModified: false }
  }
  const r = body.data?.repository
  if (!r)
    return { status: 404, data: null, rateLimit, notModified: false }

  const branch = r.defaultBranchRef?.name || 'main'
  const meta: RepoMeta = {
    name: repo,
    full_name: `${owner}/${repo}`,
    html_url: `https://github.com/${owner}/${repo}`,
    owner: { login: owner },
    default_branch: branch,
    description: r.description,
    stargazers_count: r.stargazerCount,
    forks_count: r.forkCount,
    pushed_at: r.pushedAt,
    created_at: r.createdAt,
    archived: r.isArchived,
    fork: r.isFork,
  }
  return {
    status: 200,
    data: { meta, headTreeSha: r.defaultBranchRef?.target?.tree.oid ?? null },
    rateLimit,
    notModified: false,
  }
}

export async function getTree(
  owner: string,
  repo: string,
  ref: string,
  bindings: GithubBindings,
): Promise<FetchOutcome<TreeResponse>> {
  return ghRequest<TreeResponse>(
    `${API_BASE}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
    bindings,
  )
}

export interface GetCommitsOpts {
  path?: string
  since?: string
  perPage?: number
}

export async function getCommits(
  owner: string,
  repo: string,
  opts: GetCommitsOpts,
  bindings: GithubBindings,
): Promise<FetchOutcome<CommitEntry[]>> {
  const params = new URLSearchParams()
  if (opts.path)
    params.set('path', opts.path)
  if (opts.since)
    params.set('since', opts.since)
  params.set('per_page', String(opts.perPage ?? 30))
  return ghRequest<CommitEntry[]>(
    `${API_BASE}/repos/${owner}/${repo}/commits?${params.toString()}`,
    bindings,
  )
}

/**
 * Fetch a raw file from raw.githubusercontent.com. Bypasses the JSON API.
 * No ETag caching here; raw responses don't carry useful etags for our case.
 */
export async function getRawFile(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  bindings: GithubBindings,
): Promise<string | null> {
  const headers = new Headers()
  headers.set('User-Agent', 'skilld.dev')
  if (bindings.GITHUB_TOKEN)
    headers.set('Authorization', `Bearer ${bindings.GITHUB_TOKEN}`)
  const res = await fetch(`${RAW_BASE}/${owner}/${repo}/${ref}/${path}`, { headers })
  if (!res.ok)
    return null
  return res.text()
}

export function logRateLimit(label: string, info: RateLimitInfo | null): void {
  if (!info)
    return
  if (info.remaining < 100) {
    console.warn(`[github-client] ${label} rate-limit low: ${info.remaining}/${info.limit}`)
  }
}
