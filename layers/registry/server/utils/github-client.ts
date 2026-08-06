/// <reference types="@cloudflare/workers-types" />

const API_BASE = 'https://api.github.com'
const GRAPHQL_URL = 'https://api.github.com/graphql'

/**
 * Aliases per batched GraphQL request. One alias per file in a single query is
 * what broke: `affaan-m/everything-claude-code` has 890 SKILL.md files, which
 * built a 61 KB query that GitHub answered with an nginx 502 after 10.8s, so
 * the repo failed every hour for days. Measured against that repo: 890 aliases
 * 502s, 50 per request returns 200 across 18 requests, 25 works but costs more
 * round trips for no benefit.
 */
export const GRAPHQL_BATCH_SIZE = 50

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}
const RAW_BASE = 'https://raw.githubusercontent.com'

export interface GithubBindings {
  KV_CACHE?: KVNamespace
  GITHUB_TOKEN?: string
}

type GithubBindingSource = Partial<Pick<Cloudflare.Env, 'KV_CACHE' | 'GITHUB_TOKEN'>>

/**
 * Resolve GitHub bindings from a Cloudflare env (Worker runtime) or process.env (local dev).
 * Pass the generated Cloudflare environment from the request platform or a
 * Nitro task. Falls back to process.env in local dev,
 * since `.env` populates process.env but not the Worker env binding.
 */
export function resolveGithubBindings(cloudflareEnv?: GithubBindingSource): GithubBindings {
  const env = cloudflareEnv ?? {}
  return {
    KV_CACHE: env.KV_CACHE,
    GITHUB_TOKEN: env.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN,
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
    cached = await bindings.KV_CACHE.get<CachedEntry<T>>(cacheKey, 'json').catch((error) => {
      console.warn(`[github-client] ${error instanceof Error ? error.message : String(error)}`)
      return null
    })
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
    name: string
    nameWithOwner: string
    url: string
    owner: { login: string }
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
      name nameWithOwner url owner{login}
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
    name: r.name,
    full_name: r.nameWithOwner,
    html_url: r.url,
    owner: { login: r.owner.login },
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

async function gqlPost<T>(
  query: string,
  variables: Record<string, unknown>,
  bindings: GithubBindings,
): Promise<{ status: number, data: T | null, rateLimit: RateLimitInfo | null }> {
  const headers = new Headers()
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Content-Type', 'application/json')
  headers.set('User-Agent', 'skilld.dev')
  if (bindings.GITHUB_TOKEN)
    headers.set('Authorization', `Bearer ${bindings.GITHUB_TOKEN}`)
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const rateLimit = parseRateLimit(res.headers)
  if (!res.ok)
    return { status: res.status, data: null, rateLimit }
  // A gateway can answer 200 with a truncated or non-JSON body. Parsing that
  // eagerly threw `Unexpected end of JSON input` out of the client and reached
  // the sync summary as an opaque reason with no status attached.
  const body = await res.json().catch((error) => {
    console.warn(`[github-client] GraphQL 200 with unparseable body: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }) as { data?: T, errors?: Array<{ type?: string, message?: string }> } | null
  if (!body)
    return { status: 502, data: null, rateLimit }
  if (body.errors?.length) {
    const notFound = body.errors.some(e => e.type === 'NOT_FOUND')
    return { status: notFound ? 404 : 502, data: null, rateLimit }
  }
  return { status: 200, data: body.data ?? null, rateLimit }
}

export interface BlobBatchOutcome extends FetchOutcome<Map<string, string>> {
  /**
   * Paths GitHub answered with a blob it will not hand back as text, because
   * it classifies the contents as binary. These exist upstream, so they are
   * not missing, and no retry can turn them into text.
   */
  unreadable: Set<string>
}

/**
 * Batch-fetch SKILL.md blob contents for N paths in one GraphQL request.
 * Replaces N raw.githubusercontent.com fetches (which are per-IP rate-limited
 * post-May-2025 and ignore auth headers) with a single deterministic
 * authenticated request. Returns Map<path, text>; missing/non-Blob entries
 * are absent from the map so callers can fall back per path.
 *
 * `text` alone cannot tell a missing blob from an unreadable one: GitHub
 * returns null for both. `isBinary` separates them, and the difference decides
 * whether retrying is worth anything. `lev-os/agents` lost 2,853 skills for
 * eight days to that conflation (2026-08-06).
 */
export async function getBlobsBatch(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  bindings: GithubBindings,
): Promise<BlobBatchOutcome> {
  if (paths.length === 0)
    return { status: 200, data: new Map(), unreadable: new Set(), rateLimit: null, notModified: false }
  const unique = [...new Set(paths)]
  const map = new Map<string, string>()
  const unreadable = new Set<string>()
  let rateLimit: RateLimitInfo | null = null

  for (const batch of chunk(unique, GRAPHQL_BATCH_SIZE)) {
    const varDecls = ['$owner:String!', '$repo:String!', ...batch.map((_, i) => `$expr${i}:String!`)]
    const aliases = batch.map((_, i) => `b${i}:object(expression:$expr${i}){... on Blob{text isBinary}}`).join(' ')
    const query = `query(${varDecls.join(',')}){repository(owner:$owner,name:$repo){${aliases}}}`
    const variables: Record<string, string> = { owner, repo }
    batch.forEach((p, i) => {
      variables[`expr${i}`] = `${branch}:${p}`
    })

    const out = await gqlPost<{ repository: Record<string, { text?: string | null, isBinary?: boolean } | null> | null }>(query, variables, bindings)
    rateLimit = out.rateLimit ?? rateLimit
    // A partial map would look like a repo that lost files, and the caller
    // would delete skills it simply failed to read. Fail the whole batch.
    if (!out.data?.repository)
      return { status: out.status, data: null, unreadable, rateLimit, notModified: false }
    batch.forEach((p, i) => {
      const blob = out.data!.repository![`b${i}`]
      if (typeof blob?.text === 'string')
        map.set(p, blob.text)
      else if (blob?.isBinary)
        unreadable.add(p)
    })
  }

  return { status: 200, data: map, unreadable, rateLimit, notModified: false }
}

/**
 * Batch-fetch recent commit history for N paths in one GraphQL request.
 * Replaces N REST /commits calls. Output shape matches the slice of
 * CommitEntry that sync-repo actually consumes.
 */
export async function getCommitsBatch(
  owner: string,
  repo: string,
  paths: string[],
  perPage: number,
  bindings: GithubBindings,
): Promise<FetchOutcome<Map<string, CommitEntry[]>>> {
  if (paths.length === 0)
    return { status: 200, data: new Map(), rateLimit: null, notModified: false }
  const unique = [...new Set(paths)]

  interface GqlCommit { oid: string, message: string, author?: { name?: string, email?: string, date: string, user?: { login?: string } | null } | null }
  interface GqlResponse { repository: { defaultBranchRef: { target: Record<string, { nodes: GqlCommit[] } | null> | null } | null } | null }

  const map = new Map<string, CommitEntry[]>()
  let rateLimit: RateLimitInfo | null = null

  // History queries are heavier per alias than blobs, so they share the blob
  // batch ceiling rather than getting a larger one.
  for (const batch of chunk(unique, GRAPHQL_BATCH_SIZE)) {
    const varDecls = ['$owner:String!', '$repo:String!', ...batch.map((_, i) => `$path${i}:String!`)]
    const histories = batch.map((_, i) =>
      `h${i}:history(first:${perPage},path:$path${i}){nodes{oid message author{name email date user{login}}}}`,
    ).join(' ')
    const query = `query(${varDecls.join(',')}){repository(owner:$owner,name:$repo){defaultBranchRef{target{... on Commit{${histories}}}}}}`
    const variables: Record<string, string> = { owner, repo }
    batch.forEach((p, i) => {
      variables[`path${i}`] = p
    })

    const out = await gqlPost<GqlResponse>(query, variables, bindings)
    rateLimit = out.rateLimit ?? rateLimit
    const target = out.data?.repository?.defaultBranchRef?.target
    if (!target)
      return { status: out.status, data: null, rateLimit, notModified: false }
    batch.forEach((p, i) => {
      const nodes = target[`h${i}`]?.nodes ?? []
      map.set(p, nodes.map(c => ({
        sha: c.oid,
        commit: {
          author: { name: c.author?.name, email: c.author?.email, date: c.author?.date ?? '' },
          message: c.message,
        },
        author: c.author?.user ? { login: c.author.user.login } : null,
      })))
    })
  }

  return { status: 200, data: map, rateLimit, notModified: false }
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
