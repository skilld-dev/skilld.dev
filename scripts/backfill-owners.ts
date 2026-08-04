/**
 * Populate the `owners` table from GitHub /users/{owner}.
 *
 * - Pulls unique owners from skills (filtered by broken_since IS NULL),
 *   ordered by GitHub stars so visible repositories land first.
 * - Skips owners with `last_synced_at` newer than `STALE_AFTER_HOURS`.
 * - Fetches /users/{owner}, captures kind/name/bio/blog/location/followers.
 * - Marks 404s with sync_status='404' so we don't retry them every run.
 *
 * Usage:
 *   GITHUB_TOKEN=... npx tsx scripts/backfill-owners.ts [LIMIT] \
 *     | npx wrangler d1 execute skilld-db --remote --file=-
 */

import { execFileSync } from 'node:child_process'
import process from 'node:process'

const LIMIT = Number.parseInt(process.argv[2] ?? '5000', 10)
const STALE_AFTER_HOURS = 24 * 7
const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CONCURRENCY = 6

interface OwnerRow {
  owner: string
  max_stars: number
  skill_count: number
  last_synced_at: number | null
}

interface GitHubUser {
  type: 'User' | 'Organization'
  name: string | null
  bio: string | null
  blog: string | null
  location: string | null
  followers: number
  public_repos: number
}

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')
const sqlText = (s: string | null | undefined) => s == null ? 'NULL' : `'${escape(s)}'`

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
  const staleCutoff = Math.floor(Date.now() / 1000) - STALE_AFTER_HOURS * 3600

  console.error(`[owners] querying top ${LIMIT} stale owners...`)
  const rows = d1<OwnerRow>(
    `SELECT s.owner,
            MAX(r.stars) AS max_stars,
            COUNT(*) AS skill_count,
            o.last_synced_at AS last_synced_at
     FROM skills s
     JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
     LEFT JOIN owners o ON o.owner = s.owner
     WHERE r.broken_since IS NULL
       AND (o.last_synced_at IS NULL OR o.last_synced_at < ${staleCutoff})
     GROUP BY s.owner
     ORDER BY max_stars DESC, s.owner ASC
     LIMIT ${LIMIT}`,
  )
  console.error(`[owners] ${rows.length} owners to sync (stale cutoff = ${staleCutoff})`)

  console.log('-- backfill-owners')

  let ok = 0
  let notFound = 0
  let failed = 0
  let processed = 0

  await pAll(rows, CONCURRENCY, async (row) => {
    const res = await ghJson<GitHubUser>(`https://api.github.com/users/${row.owner}`)
    processed++

    if (res.status === 404) {
      console.log(
        `INSERT INTO owners (owner, sync_status, last_synced_at) VALUES (${sqlText(row.owner)}, '404', unixepoch()) `
        + `ON CONFLICT(owner) DO UPDATE SET sync_status = '404', last_synced_at = unixepoch();`,
      )
      notFound++
      return
    }

    if (!res.data) {
      console.error(`[owners] ${row.owner} fetch failed status=${res.status}`)
      failed++
      return
    }

    const u = res.data
    const kind = u.type === 'Organization' ? 'org' : 'user'
    console.log(
      `INSERT INTO owners (owner, kind, name, bio, blog, location, followers, public_repos, last_synced_at, sync_status) `
      + `VALUES (${sqlText(row.owner)}, ${sqlText(kind)}, ${sqlText(u.name)}, ${sqlText(u.bio)}, ${sqlText(u.blog)}, ${sqlText(u.location)}, ${u.followers}, ${u.public_repos}, unixepoch(), 'ok') `
      + `ON CONFLICT(owner) DO UPDATE SET `
      + `kind = excluded.kind, name = excluded.name, bio = excluded.bio, blog = excluded.blog, location = excluded.location, `
      + `followers = excluded.followers, public_repos = excluded.public_repos, last_synced_at = excluded.last_synced_at, sync_status = 'ok';`,
    )
    ok++

    if (processed % 50 === 0)
      console.error(`[owners] progress ${processed}/${rows.length} ok=${ok} 404=${notFound} fail=${failed}`)
  })

  console.error(`[owners] done. ok=${ok} 404=${notFound} fail=${failed} of ${rows.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
