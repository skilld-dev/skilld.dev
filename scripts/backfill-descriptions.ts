/**
 * Backfill missing descriptions for the top-N (by installs) skills with
 * null description. Pure frontmatter parse, no AI, no other column updates.
 *
 * Strategy:
 *   1. Pull rows ordered by installs DESC where description IS NULL.
 *   2. Group by repo. For each repo, fetch the git tree once, build a
 *      dirName -> path map for every SKILL.md.
 *   3. For each skill row, look up the path by `name`, fetch raw SKILL.md,
 *      parse frontmatter, emit UPDATE if a description is found.
 *   4. Pipe SQL to wrangler.
 *
 * Usage:
 *   GITHUB_TOKEN=... npx tsx scripts/backfill-descriptions.ts 1000 \
 *     | npx wrangler d1 execute skilld-db --remote --file=-
 */

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { parseFrontmatter } from '../server/utils/skill-frontmatter'

const LIMIT = Number.parseInt(process.argv[2] ?? '1000', 10)
const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CONCURRENCY = 6

interface SkillRow {
  owner: string
  repo: string
  name: string
  default_branch: string | null
  installs: number
}

interface TreeEntry { path: string, type: string }
interface TreeResponse { tree: TreeEntry[], truncated?: boolean }

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')

function d1<T>(sql: string): T[] {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'skilld-db', '--remote', '--json', '--command', sql],
    {
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    },
  )
  const parsed = JSON.parse(out) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}

const ghHeaders: Record<string, string> = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'skilld.dev-backfill',
}
if (GITHUB_TOKEN)
  ghHeaders.Authorization = `Bearer ${GITHUB_TOKEN}`

async function ghJson<T>(url: string): Promise<{ data: T | null, status: number }> {
  const res = await fetch(url, { headers: ghHeaders })
  if (!res.ok)
    return { data: null, status: res.status }
  return { data: await res.json() as T, status: res.status }
}

async function fetchRaw(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
    { headers: GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {} },
  )
  if (!res.ok)
    return null
  return await res.text()
}

async function pAll<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let cursor = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        await fn(items[i]!, i)
      }
    }),
  )
}

async function main() {
  console.error(`[backfill] querying top ${LIMIT} null-desc skills...`)
  const rows = d1<SkillRow>(
    `SELECT owner, repo, name, default_branch, installs
     FROM skills
     WHERE description IS NULL AND broken_since IS NULL
     ORDER BY installs DESC
     LIMIT ${LIMIT}`,
  )
  console.error(`[backfill] ${rows.length} rows`)

  const byRepo = new Map<string, { owner: string, repo: string, branch: string, items: SkillRow[] }>()
  for (const row of rows) {
    const branch = row.default_branch || 'main'
    const key = `${row.owner}/${row.repo}@${branch}`
    let entry = byRepo.get(key)
    if (!entry) {
      entry = { owner: row.owner, repo: row.repo, branch, items: [] }
      byRepo.set(key, entry)
    }
    entry.items.push(row)
  }
  console.error(`[backfill] ${byRepo.size} unique repos`)

  console.log('-- backfill-descriptions')

  let filled = 0
  let missing = 0
  let skipped = 0
  let brokenMarked = 0
  let branchFixed = 0
  let processed = 0

  await pAll([...byRepo.values()], CONCURRENCY, async (entry) => {
    let treeRes = await ghJson<TreeResponse>(
      `https://api.github.com/repos/${entry.owner}/${entry.repo}/git/trees/${entry.branch}?recursive=1`,
    )
    let actualBranch = entry.branch
    if (!treeRes.data) {
      const repoMeta = await ghJson<{ default_branch: string }>(
        `https://api.github.com/repos/${entry.owner}/${entry.repo}`,
      )
      if (!repoMeta.data) {
        if (repoMeta.status === 404) {
          console.log(
            `UPDATE skills SET broken_since = COALESCE(broken_since, unixepoch()) `
            + `WHERE owner = '${escape(entry.owner)}' AND repo = '${escape(entry.repo)}';`,
          )
          brokenMarked += entry.items.length
          console.error(`[backfill] repo 404 ${entry.owner}/${entry.repo} -> broken (${entry.items.length} skills)`)
        }
        else {
          console.error(`[backfill] repo fetch ${repoMeta.status} ${entry.owner}/${entry.repo}`)
          skipped += entry.items.length
        }
        return
      }
      const correctBranch = repoMeta.data.default_branch
      if (correctBranch && correctBranch !== entry.branch) {
        console.log(
          `UPDATE skills SET default_branch = '${escape(correctBranch)}' `
          + `WHERE owner = '${escape(entry.owner)}' AND repo = '${escape(entry.repo)}' `
          + `AND (default_branch IS NULL OR default_branch != '${escape(correctBranch)}');`,
        )
        branchFixed += entry.items.length
        actualBranch = correctBranch
        treeRes = await ghJson<TreeResponse>(
          `https://api.github.com/repos/${entry.owner}/${entry.repo}/git/trees/${correctBranch}?recursive=1`,
        )
      }
      if (!treeRes.data) {
        console.error(`[backfill] tree miss after retry ${entry.owner}/${entry.repo}@${actualBranch}`)
        skipped += entry.items.length
        return
      }
    }
    const tree = treeRes.data
    const pathByDir = new Map<string, string>()
    for (const e of tree.tree) {
      if (e.type !== 'blob' || !e.path.endsWith('/SKILL.md'))
        continue
      const segs = e.path.split('/')
      const dir = segs[segs.length - 2]
      if (dir)
        pathByDir.set(dir, e.path)
    }

    for (const skill of entry.items) {
      processed++
      const path = pathByDir.get(skill.name)
      if (!path) {
        missing++
        continue
      }
      const raw = await fetchRaw(entry.owner, entry.repo, actualBranch, path)
      if (!raw) {
        missing++
        continue
      }
      const fm = parseFrontmatter(raw)
      const desc = fm.description?.trim()
      if (!desc) {
        missing++
        continue
      }
      console.log(
        `UPDATE skills SET description = '${escape(desc)}' `
        + `WHERE owner = '${escape(skill.owner)}' AND name = '${escape(skill.name)}' AND description IS NULL;`,
      )
      filled++
    }

    if (processed % 100 < entry.items.length)
      console.error(`[backfill] progress ${processed}/${rows.length} filled=${filled} missing=${missing} skipped=${skipped}`)
  })

  console.error(`[backfill] done. filled=${filled} missing=${missing} skipped=${skipped} broken=${brokenMarked} branch-fixed=${branchFixed} of ${rows.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
