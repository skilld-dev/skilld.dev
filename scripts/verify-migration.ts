#!/usr/bin/env tsx
/**
 * Post-migration sanity check for 0033 + 0034 + 0035. Runs SELECTs against
 * the remote D1 and exits non-zero if anything looks wrong.
 *
 * Usage: pnpm dlx tsx scripts/verify-migration.ts [--remote]
 *
 * Wraps `npx wrangler d1 execute` and parses JSON output. Requires
 * CLOUDFLARE_ACCOUNT_ID env var for --remote.
 */

import { execFileSync } from 'node:child_process'

const REMOTE = process.argv.includes('--remote')
const DB = 'skilld-db'
const CONFIG = 'wrangler.local.toml'

function exec(sql: string): unknown {
  const flag = REMOTE ? '--remote' : '--local'
  // `--file` on --remote returns upload-summary rows (Total queries executed,
  // Rows read, etc.), not the SELECT result rows. `--command` returns the
  // actual query rows. So we always invoke via --command and only fall back
  // to a temp file if the SQL is large.
  const out = execFileSync('npx', [
    'wrangler',
    'd1',
    'execute',
    DB,
    flag,
    '--config',
    CONFIG,
    '--json',
    '--command',
    sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  // --remote prepends npm warnings / upload-progress lines; the JSON envelope
  // is the top-level array starting on its own line.
  const lines = out.split('\n')
  const startLine = lines.findIndex(l => l.trimEnd() === '[')
  if (startLine === -1) {
    throw new Error(`could not locate JSON envelope in wrangler output:\n${out.slice(-2000)}`)
  }
  return JSON.parse(lines.slice(startLine).join('\n'))
}

function rows<T>(res: unknown): T[] {
  const arr = res as Array<{ results?: T[] }>
  return arr?.[0]?.results ?? []
}

let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${name}`)
  }
  else {
    failed += 1
    console.log(`✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

console.log(`Verifying ${REMOTE ? 'remote' : 'local'} D1 (${DB})\n`)

// 1. skills PK is (owner, repo, name)
const skillsSchema = rows<{ sql: string }>(exec(`SELECT sql FROM sqlite_master WHERE name = 'skills'`))
check(
  'skills PK is (owner, repo, name)',
  Boolean(skillsSchema[0]?.sql?.includes('PRIMARY KEY (owner, repo, name)')),
)

// 2. repos table exists
const repos = rows<{ n: number }>(exec(`SELECT COUNT(*) AS n FROM repos`))
check('repos table populated', (repos[0]?.n ?? 0) > 0, `${repos[0]?.n} rows`)

// 3. skills_v view is retired (migration 0050)
const viewExists = rows<{ n: number }>(exec(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='view' AND name='skills_v'`))
check(
  'skills_v view dropped',
  (viewExists[0]?.n ?? 0) === 0,
  `${viewExists[0]?.n ?? 0} view rows`,
)

// 4. Every skill row has a corresponding repos row
const orphans = rows<{ n: number }>(exec(
  `SELECT COUNT(*) AS n FROM skills s
   LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
   WHERE r.owner IS NULL`,
))
check('no orphan skills (every skill has a repos row)', (orphans[0]?.n ?? 0) === 0, `${orphans[0]?.n} orphans`)

// PRAGMA table_info() over D1's --remote JSON doesn't return result rows
// (rows_read=0), so derive the column/PK shape from the CREATE TABLE SQL in
// sqlite_master instead.
function tableSql(name: string): string {
  const r = rows<{ sql: string }>(exec(`SELECT sql FROM sqlite_master WHERE name = '${name}'`))
  return r[0]?.sql ?? ''
}

// 5. skill_revisions has repo column
check('skill_revisions has repo column', /\brepo\s+TEXT/i.test(tableSql('skill_revisions')))

// 6. skill_generated PK is (owner, repo, name, kind)
const genSql = tableSql('skill_generated')
check(
  'skill_generated PK is (owner, repo, name, kind)',
  /PRIMARY KEY\s*\(\s*owner\s*,\s*repo\s*,\s*name\s*,\s*kind\s*\)/i.test(genSql),
  genSql.match(/PRIMARY KEY[^)]*\)/)?.[0] ?? 'no PK clause',
)

// 7. activity has repo column
check('activity has repo column', /\brepo\s+TEXT/i.test(tableSql('activity')))

// 8. Smoke: vercel-labs web-design-guidelines collision case (post-sync)
if (REMOTE) {
  const collisions = rows<{ repo: string }>(exec(
    `SELECT repo FROM skills WHERE owner = 'vercel-labs' AND name = 'web-design-guidelines'`,
  ))
  check(
    'vercel-labs/web-design-guidelines exists in >= 1 repo',
    collisions.length >= 1,
    `repos: ${collisions.map(c => c.repo).join(', ') || 'none'}`,
  )
}

console.log()
if (failed > 0) {
  console.error(`${failed} check(s) failed`)
  process.exit(1)
}
console.log('All checks passed')
