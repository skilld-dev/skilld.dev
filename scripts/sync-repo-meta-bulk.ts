/**
 * Bulk-sync stars/forks/pushed_at/default_branch for repos via GitHub GraphQL.
 *
 * Reads owner/repo pairs from stdin (one per line, "owner/repo").
 * Outputs SQL UPDATE statements (and broken_since markers for missing repos).
 *
 * Usage:
 *   psql ... | npx tsx scripts/sync-repo-meta-bulk.ts > /tmp/repo-meta.sql
 *   echo "owner/repo" | npx tsx scripts/sync-repo-meta-bulk.ts > /tmp/repo-meta.sql
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const BATCH = 50

const input = readFileSync(0, 'utf-8')
const repos = input.split('\n').map(l => l.trim()).filter(Boolean).map((slug) => {
  const [owner, repo] = slug.split('/') as [string, string]
  return { owner, repo, slug }
})

console.error(`[bulk-sync] ${repos.length} repos to query`)

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')
const sqlText = (s: string | null | undefined) => s == null ? 'NULL' : `'${escape(s)}'`
const epoch = (iso: string | null | undefined) => iso ? Math.floor(new Date(iso).getTime() / 1000) : 'NULL'

interface RepoNode {
  stargazerCount: number
  forkCount: number
  pushedAt: string | null
  createdAt: string | null
  description: string | null
  defaultBranchRef: { name: string } | null
}

function ghGraphql(query: string): { data: Record<string, RepoNode | null>, errors?: { type?: string, path?: string[], message: string }[] } {
  // gh exits non-zero when GraphQL has partial errors (e.g. NOT_FOUND on one repo),
  // but stdout still contains the valid data envelope. Capture both regardless of exit.
  const res = spawnSync('gh', ['api', 'graphql', '-f', `query=${query}`], {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const stdout = res.stdout || ''
  if (!stdout.trim()) {
    throw new Error(`gh graphql failed: ${res.stderr?.slice(0, 500)}`)
  }
  return JSON.parse(stdout)
}

function buildQuery(batch: { owner: string, repo: string }[]): string {
  const parts = batch.map((r, i) =>
    `  r${i}: repository(owner: "${r.owner}", name: "${r.repo}") { stargazerCount forkCount pushedAt createdAt description defaultBranchRef { name } }`,
  )
  return `query {\n${parts.join('\n')}\n}`
}

const now = Math.floor(Date.now() / 1000)
let synced = 0
let broken = 0

for (let i = 0; i < repos.length; i += BATCH) {
  const batch = repos.slice(i, i + BATCH)
  const query = buildQuery(batch)
  let result: ReturnType<typeof ghGraphql>
  try {
    result = ghGraphql(query)
  }
  catch (e) {
    console.error(`[bulk-sync] batch ${i / BATCH} failed:`, (e as Error).message.slice(0, 200))
    continue
  }

  // GraphQL returns a NOT_FOUND error per missing repo with path: ['rN'], data still has the rest
  const notFoundIdx = new Set<number>()
  if (result.errors) {
    for (const err of result.errors) {
      if (err.type === 'NOT_FOUND' && err.path?.[0]?.startsWith('r')) {
        notFoundIdx.add(Number.parseInt(err.path[0].slice(1), 10))
      }
    }
  }

  batch.forEach((r, j) => {
    const node = result.data[`r${j}`]
    if (!node || notFoundIdx.has(j)) {
      console.log(
        `UPDATE skills SET broken_since = ${now}, repo_meta_synced_at = ${now} WHERE owner = ${sqlText(r.owner)} AND repo = ${sqlText(r.repo)};`,
      )
      broken++
      return
    }
    console.log(
      `UPDATE skills SET stars = ${node.stargazerCount}, forks = ${node.forkCount}, pushed_at = ${epoch(node.pushedAt)}, repo_created_at = ${epoch(node.createdAt)}, default_branch = ${sqlText(node.defaultBranchRef?.name ?? null)}, description = COALESCE(description, ${sqlText(node.description)}), repo_meta_synced_at = ${now}, broken_since = NULL WHERE owner = ${sqlText(r.owner)} AND repo = ${sqlText(r.repo)};`,
    )
    synced++
  })

  if ((i / BATCH) % 10 === 0)
    console.error(`[bulk-sync] processed ${i + batch.length}/${repos.length} (synced=${synced}, broken=${broken})`)
}

console.error(`[bulk-sync] done. synced=${synced}, broken=${broken}`)
