/**
 * Dump local `skill_generated` rows and apply them to remote D1.
 * One INSERT per row (D1 has a per-statement size limit that blows up
 * when we batch 512-dim vectors into a single VALUES list).
 *
 * Usage: npx tsx scripts/prototype-seed-remote.ts
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function d1Query<T>(flag: '--local' | '--remote', sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', flag, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0)
    throw new Error(`d1 query failed (${flag}): ${res.stderr}`)
  return (JSON.parse(res.stdout)[0]?.results ?? []) as T[]
}

function d1File(flag: '--local' | '--remote', sql: string): void {
  const tmp = `/tmp/seed-remote-${Date.now()}.sql`
  writeFileSync(tmp, sql)
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', flag, '--file', tmp], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error('stderr:', res.stderr?.slice(0, 800))
    throw new Error(`d1 file exec failed (${flag}): ${res.status}`)
  }
}

const rows = d1Query<{ owner: string, repo: string, name: string, kind: string, sha: string, payload: string, generated_at: string }>(
  '--local',
  'SELECT owner, repo, name, kind, sha, payload, generated_at FROM skill_generated',
)
console.log(`dumping ${rows.length} local rows`)

const byKind = new Map<string, number>()
for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1)
console.log(`  by kind: ${[...byKind].map(([k, n]) => `${k}=${n}`).join('  ')}`)

const esc = (s: string) => s.replace(/'/g, '\'\'')
const statements = rows.map(r =>
  `INSERT OR REPLACE INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES ('${esc(r.owner)}','${esc(r.repo)}','${esc(r.name)}','${esc(r.kind)}','${esc(r.sha)}','${esc(r.payload)}','${esc(r.generated_at)}');`,
)

// Chunk to stay under D1 request-size limit (10MB)
const CHUNK = 20
for (let i = 0; i < statements.length; i += CHUNK) {
  const slice = statements.slice(i, i + CHUNK)
  console.log(`  applying ${i + 1}-${i + slice.length} of ${statements.length}...`)
  d1File('--remote', slice.join('\n'))
}

console.log(`\n✓ seeded ${rows.length} rows to remote D1`)

const counts = d1Query<{ kind: string, n: number }>(
  '--remote',
  'SELECT kind, COUNT(*) as n FROM skill_generated GROUP BY kind',
)
console.log('remote counts:')
for (const c of counts) console.log(`  ${c.kind}: ${c.n}`)
