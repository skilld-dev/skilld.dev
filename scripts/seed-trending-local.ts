/**
 * Give the local database enough social evidence to render the trending band.
 *
 * The band reads `x_posts` joined to `x_post_repos`, which only the discovery
 * cron ever writes, so a local database has none of it and the homepage hides
 * the band entirely. That made the site's top call to action the one surface
 * nobody could see while working on it.
 *
 * This writes one post per repository, dated inside the window, with likes
 * above the floor. It picks repositories that already exist locally and hold
 * a resolved skill, which is what `indexedOnly` checks.
 *
 * Usage:
 *   pnpm tsx scripts/seed-trending-local.ts            # 8 repositories
 *   pnpm tsx scripts/seed-trending-local.ts --count 12
 *
 * Local only. It refuses to touch production, and the ids it writes are
 * prefixed `local-seed-` so they are easy to find and delete.
 */

import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const DATABASE = 'skilld-db'
const CONFIG = 'wrangler.jsonc'
const ID_PREFIX = 'local-seed-'

const { values } = parseArgs({
  options: {
    count: { type: 'string' },
    clean: { type: 'boolean', default: false },
  },
})

const COUNT = Math.min(Math.max(Number.parseInt(values.count ?? '8', 10) || 8, 1), 24)

function d1(command: string): any[] {
  const out = execFileSync('npx', [
    'wrangler',
    'd1',
    'execute',
    DATABASE,
    '--local',
    '--config',
    CONFIG,
    '--json',
    '--command',
    command,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })
  const parsed = JSON.parse(out)
  if (parsed?.error)
    throw new Error(String(parsed.error.text ?? parsed.error))
  return parsed[0]?.results ?? []
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, '\'\'')}'`
}

function clean(): void {
  d1(`DELETE FROM x_post_repos WHERE post_id LIKE '${ID_PREFIX}%'`)
  d1(`DELETE FROM x_posts WHERE post_id LIKE '${ID_PREFIX}%'`)
}

function main(): void {
  clean()
  if (values.clean) {
    console.log('Removed the seeded posts.')
    return
  }

  const repos = d1(`
    SELECT s.owner, s.repo, COUNT(*) AS skills, MAX(r.stars) AS stars
    FROM skills s
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
    WHERE s.sync_status = 'ok' AND s.source_resolved = 1
    GROUP BY s.owner, s.repo
    ORDER BY stars DESC
    LIMIT ${COUNT}
  `.replace(/\s+/g, ' ').trim()) as Array<{ owner: string, repo: string, stars: number }>

  if (!repos.length) {
    console.error('No local repository holds an indexed skill. Seed skills first.')
    process.exitCode = 1
    return
  }

  const now = Math.floor(Date.now() / 1000)
  const postValues: string[] = []
  const repoValues: string[] = []

  repos.forEach((repo, index) => {
    const postId = `${ID_PREFIX}${index + 1}`
    // Spread the posts across the week and give the earlier ones more likes,
    // so the ranking has something to order rather than a flat list.
    const postedAt = now - (index + 1) * 6 * 3600
    const likes = 480 - index * 27
    postValues.push([
      sqlString(postId),
      sqlString(`${ID_PREFIX}author-${index + 1}`),
      sqlString(`dev_${repo.owner}`.slice(0, 15)),
      sqlString(`Local Seed ${index + 1}`),
      String(2_000 + index * 130),
      sqlString(`Local seed post. ${repo.owner}/${repo.repo} is worth a look this week.`),
      sqlString('en'),
      String(postedAt),
      String(postedAt),
      String(likes),
      String(Math.floor(likes / 4)),
      String(Math.floor(likes / 9)),
      String(now),
      // next_refresh_at is NOT NULL with no default: the refresh queue owns it.
      String(now + 6 * 3600),
    ].join(', '))
    repoValues.push(`(${sqlString(postId)}, ${sqlString(repo.owner)}, ${sqlString(repo.repo)}, 'link')`)
  })

  d1(`INSERT OR REPLACE INTO x_posts (
        post_id, author_id, author_handle, author_name, author_followers,
        text_extract, lang, posted_at, first_seen_at,
        favourite_count, repost_count, reply_count, metrics_updated_at,
        next_refresh_at
      ) VALUES ${postValues.map(value => `(${value})`).join(', ')}`)
  d1(`INSERT OR REPLACE INTO x_post_repos (post_id, owner, repo, match_kind) VALUES ${repoValues.join(', ')}`)

  console.log(`Seeded ${repos.length} posts: ${repos.map(r => `${r.owner}/${r.repo}`).join(', ')}`)
  console.log('Remove them with --clean.')
}

main()
