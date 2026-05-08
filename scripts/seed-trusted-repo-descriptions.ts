/**
 * Seed missing skill descriptions for trusted repos from GitHub repo metadata.
 *
 * This is deterministic/source-backed: it uses the GitHub repository
 * description, and does not call AI. By default it only fills missing/blank
 * skill descriptions so SKILL.md frontmatter remains more specific when
 * present.
 *
 * Preview:
 *   npx tsx scripts/seed-trusted-repo-descriptions.ts
 *
 * Emit SQL:
 *   npx tsx scripts/seed-trusted-repo-descriptions.ts --emit-sql \
 *     > /tmp/skilld-trusted-repo-descriptions.sql
 *
 * Emit SQL for missing descriptions in a remote DB trust bucket:
 *   npx tsx scripts/seed-trusted-repo-descriptions.ts --from-db --trust-tier untrusted --emit-sql \
 *     > /tmp/skilld-untrusted-repo-descriptions.sql
 *
 * Apply:
 *   npx wrangler d1 execute skilld-db --remote \
 *     --file=/tmp/skilld-trusted-repo-descriptions.sql
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { initialSupportedRepos } from '../server/utils/supported-sources'

interface GithubRepoMeta {
  description: string | null
}

const SQUOTE_RE = /'/g
const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'

function readDotenvValue(key: string): string | undefined {
  if (!existsSync('.env'))
    return undefined
  const line = readFileSync('.env', 'utf-8')
    .split(/\r?\n/)
    .find(entry => entry.startsWith(`${key}=`))
  if (!line)
    return undefined
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') || undefined
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? readDotenvValue('GITHUB_TOKEN')

function escape(s: string): string {
  return s.replace(SQUOTE_RE, '\'\'')
}

function sqlString(s: string): string {
  return `'${escape(s)}'`
}

function sqlStringList(values: string[]): string {
  return values.map(sqlString).join(', ')
}

function splitRepo(ref: string): { owner: string, repo: string } {
  const parts = ref.split('/').filter(Boolean)
  if (parts.length !== 2) {
    throw new Error(`Expected owner/repo, got ${ref}`)
  }
  return { owner: parts[0]!, repo: parts[1]! }
}

function uniqueRepos(refs: { owner: string, repo: string }[]): { owner: string, repo: string }[] {
  const seen = new Set<string>()
  const out: { owner: string, repo: string }[] = []
  for (const ref of refs) {
    const key = `${ref.owner}/${ref.repo}`.toLowerCase()
    if (seen.has(key))
      continue
    seen.add(key)
    out.push(ref)
  }
  return out.sort((a, b) => `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`))
}

function d1<T>(sql: string): T[] {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'skilld-db', '--remote', '--json', '--command', sql],
    {
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? ACCOUNT_ID },
    },
  )
  const parsed = JSON.parse(out) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}

function reposFromRemoteDB(trustTiers: string[], limit: number | null): { owner: string, repo: string }[] {
  const trustFilter = trustTiers.length
    ? `AND trust_tier IN (${sqlStringList(trustTiers)})`
    : ''
  const limitSql = limit ? `LIMIT ${limit}` : ''
  return d1<{ owner: string, repo: string }>(
    `SELECT owner, repo
     FROM skills
     WHERE broken_since IS NULL
       AND (description IS NULL OR trim(description) = '')
       ${trustFilter}
     GROUP BY owner, repo
     ORDER BY COUNT(*) DESC, owner ASC, repo ASC
     ${limitSql}`,
  )
}

async function fetchRepoDescription(owner: string, repo: string): Promise<{ description: string | null, status: number }> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'skilld.dev-description-seed',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (GITHUB_TOKEN)
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
  if (!res.ok)
    return { description: null, status: res.status }

  const data = await res.json() as GithubRepoMeta
  return {
    description: data.description?.replace(/\s+/g, ' ').trim() || null,
    status: res.status,
  }
}

const { values } = parseArgs({
  options: {
    'emit-sql': { type: 'boolean' },
    'from-db': { type: 'boolean' },
    'limit': { type: 'string' },
    'overwrite': { type: 'boolean' },
    'repo': { type: 'string', multiple: true },
    'trust-tier': { type: 'string', multiple: true },
  },
})

const emitSql = Boolean(values['emit-sql'])
const fromDb = Boolean(values['from-db'])
const overwrite = Boolean(values.overwrite)
const limit = values.limit ? Number.parseInt(values.limit, 10) : null
if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error(`Expected --limit to be a positive integer, got ${values.limit}`)
}
const trustTiers = values['trust-tier'] ?? []
const repos = fromDb
  ? reposFromRemoteDB(trustTiers, limit)
  : values.repo?.length
    ? uniqueRepos(values.repo.map(splitRepo))
    : uniqueRepos(initialSupportedRepos)

console.error(`[trusted-desc] repos=${repos.length} emit=${emitSql ? 'yes' : 'no'} overwrite=${overwrite ? 'yes' : 'no'} source=${fromDb ? `db:${trustTiers.join(',') || 'all'}` : 'supported-list'}`)

if (emitSql)
  console.log('-- seed-trusted-repo-descriptions')

let found = 0
let withoutDescription = 0
let failed = 0

for (const { owner, repo } of repos) {
  const result = await fetchRepoDescription(owner, repo)
  if (!result.description) {
    if (result.status >= 400) {
      failed++
      console.error(`[trusted-desc] fetch ${result.status} ${owner}/${repo}`)
    }
    else {
      withoutDescription++
      console.error(`[trusted-desc] no repo description ${owner}/${repo}`)
    }
    continue
  }

  found++
  console.error(`[trusted-desc] ${owner}/${repo}: ${result.description}`)

  if (!emitSql)
    continue

  const whereDescription = overwrite
    ? ''
    : ` AND (description IS NULL OR trim(description) = '')`
  console.log(
    `UPDATE skills
     SET description = ${sqlString(result.description)},
         repo_meta_synced_at = unixepoch()
     WHERE owner = ${sqlString(owner)}
       AND repo = ${sqlString(repo)}
       AND broken_since IS NULL${whereDescription};`,
  )
}

console.error(`[trusted-desc] done found=${found} no-description=${withoutDescription} failed=${failed}`)
