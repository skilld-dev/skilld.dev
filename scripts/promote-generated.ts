/**
 * Copy `skill_generated` rows from local D1 to remote D1 by kind. Use after
 * running `prototype-derived.ts` locally so generated content can be reviewed
 * before going live.
 *
 * Usage:
 *   pnpm tsx scripts/promote-generated.ts --kind summary
 *   pnpm tsx scripts/promote-generated.ts --kind summary --slugs-file /tmp/gsc-slugs.txt
 *   pnpm tsx scripts/promote-generated.ts --kind summary --dry-run
 *
 * Behavior:
 *   - Reads rows from local D1 (filtered by kind, optionally restricted by slug list).
 *   - Writes to remote D1 via `INSERT ... ON CONFLICT DO UPDATE`, idempotent.
 *   - Skips rows where remote already has the same sha (no-op writes elided).
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'kind': { type: 'string' },
    'slugs-file': { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
})

if (!values.kind || !['faq', 'tags', 'embedding', 'summary'].includes(values.kind)) {
  console.error('Usage: --kind <faq|tags|embedding|summary> [--slugs-file path] [--dry-run]')
  process.exit(1)
}

const KIND = values.kind

interface RawRow {
  owner: string
  repo: string
  name: string
  kind: string
  sha: string
  payload: string
  generated_at: string
}

function d1(target: 'local' | 'remote', sql: string): RawRow[] {
  const flag = target === 'local' ? '--local' : '--remote'
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', flag, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error(res.stderr)
    throw new Error(`wrangler d1 ${flag} exec failed (${res.status})`)
  }
  const parsed = JSON.parse(res.stdout) as { results?: RawRow[] }[]
  return parsed[0]?.results ?? []
}

function escape(v: string): string {
  return v.replace(/'/g, '\'\'')
}

function readSlugSet(): Set<string> | null {
  const path = values['slugs-file']
  if (!path)
    return null
  const slugs = readFileSync(path, 'utf-8')
    .split('\n')
    .map((s: string) => s.trim())
    .filter(Boolean)
  return new Set(slugs)
}

function rowSlug(row: RawRow): string {
  return `${row.owner}/${row.name}`
}

async function run(): Promise<void> {
  const slugFilter = readSlugSet()

  console.log(`▸ Reading local rows for kind=${KIND}`)
  const localRows = d1('local', `SELECT owner, repo, name, kind, sha, payload, generated_at FROM skill_generated WHERE kind = '${KIND}'`)
  console.log(`  local: ${localRows.length} rows`)

  const filtered = slugFilter ? localRows.filter(r => slugFilter.has(rowSlug(r))) : localRows
  if (slugFilter)
    console.log(`  after slug filter: ${filtered.length} rows`)

  if (!filtered.length) {
    console.log('Nothing to promote.')
    return
  }

  console.log(`▸ Reading remote shas for kind=${KIND} to skip already-current rows`)
  const remoteRows = d1('remote', `SELECT owner, name, sha FROM skill_generated WHERE kind = '${KIND}'`)
  const remoteSha = new Map<string, string>()
  for (const r of remoteRows)
    remoteSha.set(`${r.owner}/${r.name}`, r.sha)
  console.log(`  remote: ${remoteRows.length} existing rows for this kind`)

  const toWrite = filtered.filter(r => remoteSha.get(rowSlug(r)) !== r.sha)
  console.log(`  delta to write: ${toWrite.length}`)

  if (values['dry-run']) {
    for (const r of toWrite)
      console.log(`  + ${rowSlug(r)} (sha=${r.sha.slice(0, 8)})`)
    console.log('Dry run, no writes.')
    return
  }

  // Batch into multi-row INSERT statements to keep wrangler invocations down.
  const BATCH = 25
  let written = 0
  for (let i = 0; i < toWrite.length; i += BATCH) {
    const chunk = toWrite.slice(i, i + BATCH)
    const valuesSql = chunk
      .map(r => `('${escape(r.owner)}', '${escape(r.repo)}', '${escape(r.name)}', '${escape(r.kind)}', '${escape(r.sha)}', '${escape(r.payload)}', '${escape(r.generated_at)}')`)
      .join(',')
    const sql = `INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES ${valuesSql} ON CONFLICT(owner, name, kind) DO UPDATE SET repo = excluded.repo, sha = excluded.sha, payload = excluded.payload, generated_at = excluded.generated_at`
    d1('remote', sql)
    written += chunk.length
    console.log(`  wrote ${written}/${toWrite.length}`)
  }

  console.log(`✓ Promoted ${written} rows of kind=${KIND} to remote.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
