/// <reference types="@cloudflare/workers-types" />

import { resolveGithubBindings } from '#layers/registry/server/utils/github-client'
import { syncRepo } from '#layers/registry/server/utils/sync-repo'

interface CodeSearchItem {
  path: string
  repository: { name: string, owner: { login: string }, fork?: boolean }
}

interface CodeSearchResponse {
  total_count: number
  incomplete_results: boolean
  items: CodeSearchItem[]
}

export interface ScanResult {
  hits: number
  reposFound: number
  reposSynced: number
  reposFailed: number
}

const PER_PAGE = 100
const MAX_PAGES = 10 // GitHub code search caps at 1000 results

export async function scanOwnedRepos(opts: {
  login: string
  userToken: string
  db: D1Database
  env: Record<string, unknown>
}): Promise<ScanResult> {
  const { login, userToken, db, env } = opts
  const seen = new Set<string>()
  let totalHits = 0

  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = encodeURIComponent(`filename:SKILL.md user:${login} is:public`)
    const res = await fetch(
      `https://api.github.com/search/code?q=${q}&per_page=${PER_PAGE}&page=${page}`,
      {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'skilld.dev',
        },
      },
    )
    if (!res.ok) {
      if (res.status === 401)
        throw createError({ statusCode: 401, message: 'Re-authentication required' })
      if (res.status === 403 || res.status === 429)
        throw createError({ statusCode: 429, message: 'GitHub rate limit' })
      throw createError({ statusCode: 502, message: `GitHub code search ${res.status}` })
    }
    const body = await res.json() as CodeSearchResponse
    totalHits = body.total_count
    for (const item of body.items) {
      if (item.repository.fork)
        continue
      if (item.repository.owner.login.toLowerCase() !== login.toLowerCase())
        continue
      seen.add(`${item.repository.owner.login}/${item.repository.name}`)
    }
    if (body.items.length < PER_PAGE)
      break
  }

  const bindings = resolveGithubBindings(env)
  let synced = 0
  let failed = 0
  for (const full of seen) {
    const [owner, repo] = full.split('/')
    const stats = await syncRepo(owner!, repo!, bindings, db).catch(() => null)
    if (stats && (stats.status === 'ok' || stats.status === 'skipped-pushed-at' || stats.status === 'skipped-tree-sha'))
      synced++
    else
      failed++
  }

  return { hits: totalHits, reposFound: seen.size, reposSynced: synced, reposFailed: failed }
}
