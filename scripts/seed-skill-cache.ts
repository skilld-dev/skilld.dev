/**
 * Pre-warm prod KV by hitting both skill endpoints for every row in the
 * registry. Each request is a write-through: the handler resolves SKILL.md,
 * fetches commits, etc. and stores the result in KV_CACHE. Slugs that come
 * back with resolutionStatus !== 'ok' or 5xx are recorded to broken-skills.json
 * for triage.
 *
 * Usage:
 *   pnpm tsx scripts/seed-skill-cache.ts                       # all skills, prod
 *   pnpm tsx scripts/seed-skill-cache.ts --base http://localhost:3000
 *   pnpm tsx scripts/seed-skill-cache.ts --limit 50            # cap rows
 *   pnpm tsx scripts/seed-skill-cache.ts --concurrency 4
 *   pnpm tsx scripts/seed-skill-cache.ts --local               # use --local D1
 *   pnpm tsx scripts/seed-skill-cache.ts --skip-related        # critical only
 *   pnpm tsx scripts/seed-skill-cache.ts --flag                # write broken_since to D1
 */

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'base': { type: 'string', default: 'https://skilld.dev' },
    'limit': { type: 'string' },
    'concurrency': { type: 'string', default: '6' },
    'local': { type: 'boolean' },
    'skip-related': { type: 'boolean' },
    'flag': { type: 'boolean' },
    'out': { type: 'string', default: 'broken-skills.json' },
  },
})

const BASE = values.base!.replace(/\/$/, '')
const REMOTE_FLAG = values.local ? '--local' : '--remote'
const CONCURRENCY = Math.max(1, Number(values.concurrency) || 6)
const LIMIT = values.limit ? Number(values.limit) : null
const SKIP_RELATED = !!values['skip-related']
const FLAG = !!values.flag
const OUT = values.out!

interface SkillRow {
  slug: string
  owner: string
  repo: string
  name: string
  installs: number
}

interface CriticalResponse {
  resolutionStatus?: 'ok' | 'path_missing' | 'fetch_failed'
  skillPath: string | null
  contentHtml: string | null
  stars?: number
  forks?: number
  pushedAt?: string | null
  createdAt?: string | null
  description?: string | null
  branch?: string
}

interface MetaUpdate {
  owner: string
  repo: string
  name: string
  stars: number
  forks: number
  pushedAt: number | null
  repoCreatedAt: number | null
  description: string | null
  defaultBranch: string | null
}

function inferStatus(r: CriticalResponse): 'ok' | 'path_missing' | 'fetch_failed' {
  if (r.resolutionStatus)
    return r.resolutionStatus
  if (r.skillPath && r.contentHtml)
    return 'ok'
  if (!r.skillPath)
    return 'path_missing'
  return 'fetch_failed'
}

interface BrokenEntry {
  slug: string
  owner: string
  repo: string
  name: string
  installs: number
  reason: string
  detail?: string
}

function d1Query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error(res.stderr)
    throw new Error(`wrangler d1 exec failed (${res.status})`)
  }
  const parsed = JSON.parse(res.stdout) as { results?: T[] }[]
  return parsed[0]?.results ?? []
}

function d1Exec(sql: string): void {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error(res.stderr)
    throw new Error(`wrangler d1 exec failed (${res.status})`)
  }
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, '\'\'')}'`
}

function sqlNum(n: number | null): string {
  return n === null ? 'NULL' : String(n)
}

function sqlNullableString(s: string | null): string {
  return s === null ? 'NULL' : sqlString(s)
}

function syncMeta(metas: MetaUpdate[]): void {
  if (!metas.length)
    return
  // One statement per row, batched into chunks separated by `;` for fewer
  // wrangler round-trips. SQLite handles multi-statement scripts fine.
  const CHUNK = 100
  for (let i = 0; i < metas.length; i += CHUNK) {
    const slice = metas.slice(i, i + CHUNK)
    // Repo-level cols target `repos`; per-skill description stays on `skills`.
    const stmts = slice
      .flatMap(m => [
        `UPDATE repos SET stars = ${m.stars}, forks = ${m.forks}, pushed_at = ${sqlNum(m.pushedAt)}, repo_created_at = ${sqlNum(m.repoCreatedAt)}, default_branch = ${sqlNullableString(m.defaultBranch)}, repo_meta_synced_at = unixepoch() WHERE owner = ${sqlString(m.owner)} AND repo = ${sqlString(m.repo)};`,
        `UPDATE skills SET description = ${sqlNullableString(m.description)} WHERE owner = ${sqlString(m.owner)} AND repo = ${sqlString(m.repo)} AND name = ${sqlString(m.name)};`,
      ])
      .join(' ')
    d1Exec(stmts)
  }
  console.log(`  meta synced for ${metas.length} skills`)
}

function flagBroken(skills: SkillRow[], broken: BrokenEntry[]): void {
  if (!skills.length)
    return
  // broken_since lives on `repos` (post-0034); per-skill brokenness rolls up
  // to the repo since every skill in a 404'd repo is broken together.
  const brokenRepoKeys = new Set(broken.map(b => `${b.owner}/${b.repo}`))
  const toFlag = [...new Set(broken.map(b => `${b.owner}/${b.repo}`))]
    .map((k) => {
      const [owner, repo] = k.split('/') as [string, string]
      return { owner, repo }
    })
  const toClear = [...new Set(
    skills
      .filter(s => !brokenRepoKeys.has(`${s.owner}/${s.repo}`))
      .map(s => `${s.owner}/${s.repo}`),
  )].map((k) => {
    const [owner, repo] = k.split('/') as [string, string]
    return { owner, repo }
  })

  const CHUNK = 100

  function runChunked(rows: { owner: string, repo: string }[], stmt: (r: { owner: string, repo: string }) => string) {
    for (let i = 0; i < rows.length; i += CHUNK)
      d1Exec(rows.slice(i, i + CHUNK).map(stmt).join(' '))
  }

  runChunked(toFlag, r =>
    `UPDATE repos SET broken_since = unixepoch() WHERE broken_since IS NULL AND owner = ${sqlString(r.owner)} AND repo = ${sqlString(r.repo)};`)

  runChunked(toClear, r =>
    `UPDATE repos SET broken_since = NULL WHERE broken_since IS NOT NULL AND owner = ${sqlString(r.owner)} AND repo = ${sqlString(r.repo)};`)

  console.log(`  flagged ${toFlag.length}, cleared ${toClear.length}`)
}

function listSkills(): SkillRow[] {
  const limitClause = LIMIT ? ` LIMIT ${LIMIT}` : ''
  const rows = d1Query<{ slug: string, owner: string, repo: string, name: string, installs: number }>(
    `SELECT slug, owner, repo, name, installs FROM skills ORDER BY installs DESC${limitClause}`,
  )
  return rows
}

function toUnixSeconds(iso: string | null | undefined): number | null {
  if (!iso)
    return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}

async function warmSkill(skill: SkillRow): Promise<{ broken: BrokenEntry | null, meta: MetaUpdate | null }> {
  const criticalUrl = `${BASE}/api/skills/${skill.slug}`
  let critical: CriticalResponse | null = null
  try {
    const res = await fetch(criticalUrl, { headers: { 'user-agent': 'skilld-seed/1' } })
    if (!res.ok) {
      return {
        broken: {
          slug: skill.slug,
          owner: skill.owner,
          repo: skill.repo,
          name: skill.name,
          installs: skill.installs,
          reason: `http_${res.status}`,
        },
        meta: null,
      }
    }
    critical = await res.json() as CriticalResponse
  }
  catch (err) {
    return {
      broken: {
        slug: skill.slug,
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        installs: skill.installs,
        reason: 'fetch_error',
        detail: err instanceof Error ? err.message : String(err),
      },
      meta: null,
    }
  }

  if (!SKIP_RELATED) {
    await fetch(`${BASE}/api/skill-related/${skill.slug}`, { headers: { 'user-agent': 'skilld-seed/1' } })
      .catch(() => null)
  }

  const status = inferStatus(critical)
  const meta: MetaUpdate | null = critical.stars !== undefined || critical.description !== undefined || critical.branch !== undefined
    ? {
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        stars: critical.stars ?? 0,
        forks: critical.forks ?? 0,
        pushedAt: toUnixSeconds(critical.pushedAt),
        repoCreatedAt: toUnixSeconds(critical.createdAt),
        description: critical.description ?? null,
        defaultBranch: critical.branch ?? null,
      }
    : null

  if (status !== 'ok') {
    return {
      broken: {
        slug: skill.slug,
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name,
        installs: skill.installs,
        reason: status,
      },
      meta,
    }
  }

  return { broken: null, meta }
}

async function pool<T, R>(items: T[], n: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length })
  let cursor = 0
  async function next() {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await worker(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => next()))
  return out
}

async function main() {
  console.log(`▸ Listing skills (${REMOTE_FLAG})…`)
  const skills = listSkills()
  console.log(`  ${skills.length} rows`)
  if (!skills.length)
    return

  console.log(`▸ Warming ${BASE} (concurrency=${CONCURRENCY}${SKIP_RELATED ? ', critical only' : ''})…`)
  let done = 0
  const broken: BrokenEntry[] = []
  const metas: MetaUpdate[] = []

  await pool(skills, CONCURRENCY, async (skill) => {
    const { broken: brokenEntry, meta } = await warmSkill(skill)
    done++
    if (meta)
      metas.push(meta)
    if (brokenEntry) {
      broken.push(brokenEntry)
      console.log(`  [${done}/${skills.length}] ✗ ${skill.slug} → ${brokenEntry.reason}`)
    }
    else if (done % 25 === 0 || done === skills.length) {
      console.log(`  [${done}/${skills.length}] ok (${broken.length} broken so far)`)
    }
  })

  broken.sort((a, b) => b.installs - a.installs)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, total: skills.length, broken }, null, 2)}\n`)

  if (FLAG && metas.length) {
    console.log(`\n▸ Syncing repo meta to D1 (${REMOTE_FLAG})…`)
    syncMeta(metas)
  }

  if (FLAG) {
    console.log(`\n▸ Writing broken_since flags to D1 (${REMOTE_FLAG})…`)
    flagBroken(skills, broken)
  }

  console.log(`\n▸ Done. ${skills.length - broken.length}/${skills.length} ok.`)
  console.log(`  ${broken.length} broken → ${OUT}`)
  if (broken.length) {
    const top = broken.slice(0, 10)
    console.log('\n  Top broken by installs:')
    for (const b of top)
      console.log(`    ${b.installs.toString().padStart(7)} ${b.slug.padEnd(50)} ${b.reason}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
