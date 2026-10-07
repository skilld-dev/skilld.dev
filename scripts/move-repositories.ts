/**
 * One-off backfill: move Repositories that GitHub renamed or transferred to
 * their new names (ADR-0015). Sync makes the same move when it next reads a
 * moved Repository. This runs it now, for the moves the 2026-10-07 run sweep
 * found failing on GitHub's 301.
 *
 * Every move runs the statements `syncRepo` runs, from
 * `layers/registry/server/utils/repository-move.ts`, one SQL file per move.
 * Wrangler runs each file in one transaction, so a move lands whole or not
 * at all. A move whose rows already moved changes nothing.
 *
 * Usage:
 *   pnpm exec tsx scripts/move-repositories.ts [--local] [--out <dir>]
 *     Dry run. Confirms each new name with GitHub by Repository ID, reads the
 *     rows each move touches, and writes the SQL files. Reads only.
 *   pnpm exec tsx scripts/move-repositories.ts --apply [--local] [--out <dir>]
 *     The same checks, then runs each SQL file.
 *   --reverse
 *     Moves each Repository back to its old name. Sync moves it forward again
 *     on its next read, unless the deploy that follows GitHub is rolled back.
 *
 * `--local` reads and writes the local D1 that `wrangler dev` uses.
 * Set GITHUB_TOKEN to read GitHub with your own allowance instead of the
 * anonymous one.
 */

import type { HeldRepositoryName, RepositoryMove, RepositoryName } from '../layers/registry/server/utils/repository-move'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { movedRegistryName, planRepositoryMove, repositoryMoveSql, sameRepositoryName } from '../layers/registry/server/utils/repository-move'

interface KnownMove {
  /** The registry identity the rows carry now. */
  from: RepositoryName
  /** GitHub's name for the Repository now. */
  to: RepositoryName
  repositoryId: number
}

// Confirmed on 2026-10-07 with `GET /repositories/<id>`.
const KNOWN_MOVES: KnownMove[] = [
  { from: { owner: 'box', repo: 'box-for-ai' }, to: { owner: 'box', repo: 'skills' }, repositoryId: 1187616611 },
  { from: { owner: 'brianlovin', repo: 'claude-config' }, to: { owner: 'brianlovin', repo: 'agent-config' }, repositoryId: 1137712370 },
  { from: { owner: 'dmccreary', repo: 'claude-skills' }, to: { owner: 'dmccreary', repo: 'ibook-skills' }, repositoryId: 1087738380 },
  { from: { owner: 'facebook', repo: 'react' }, to: { owner: 'react', repo: 'react' }, repositoryId: 10270250 },
  { from: { owner: 'flutter', repo: 'skills' }, to: { owner: 'flutter', repo: 'agent-plugins' }, repositoryId: 1167049909 },
  { from: { owner: 'georgeguimaraes', repo: 'claude-code-elixir' }, to: { owner: 'georgeguimaraes', repo: 'elixir-agent-tools' }, repositoryId: 1123032156 },
  { from: { owner: 'hyf0', repo: 'vue-skills' }, to: { owner: 'vuejs-ai', repo: 'skills' }, repositoryId: 1138832642 },
  { from: { owner: 'launchdarkly', repo: 'agent-skills' }, to: { owner: 'launchdarkly', repo: 'ai-tooling' }, repositoryId: 1148493063 },
  { from: { owner: 'palkan', repo: 'skills' }, to: { owner: 'palkan', repo: 'layered-rails-skills' }, repositoryId: 1150861761 },
  { from: { owner: 'shadcn', repo: 'ui' }, to: { owner: 'shadcn-ui', repo: 'ui' }, repositoryId: 585146387 },
  { from: { owner: 'sveltejs', repo: 'mcp' }, to: { owner: 'sveltejs', repo: 'ai-tools' }, repositoryId: 1054419133 },
  { from: { owner: 'vercel-labs', repo: 'vercel-plugin' }, to: { owner: 'vercel', repo: 'vercel-plugin' }, repositoryId: 1172750294 },
  { from: { owner: 'waynesutton', repo: 'convexskills' }, to: { owner: 'waynesutton', repo: 'builder-skills' }, repositoryId: 1133906703 },
]

const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'

// The tables a move rewrites, and the column that holds the Repository name.
const COUNTED_TABLES: Array<[table: string, repo: string]> = [
  ['repos', 'repo'],
  ['skills', 'repo'],
  ['skill_likes', 'repo'],
  ['skill_revisions', 'repo'],
  ['skill_generated', 'repo'],
  ['activity', 'repo'],
  ['collection_skills_v2', 'repo'],
  ['skill_subscriptions', 'repo'],
  ['skill_trending_admissions', 'repo'],
  ['skill_trending_awards', 'repo'],
  ['artifact_run_checks', 'repository'],
  ['repo_star_observations', 'repo'],
  ['x_post_skills', 'repo'],
]

type Target = { _tag: 'local' } | { _tag: 'remote' }

interface GithubRepository {
  id: number
  full_name: string
}

function d1Args(target: Target): string[] {
  return ['exec', 'wrangler', 'd1', 'execute', 'DB', '--config', 'wrangler.jsonc', target._tag === 'local' ? '--local' : '--remote']
}

function runWrangler(target: Target, args: string[]): string {
  return execFileSync('pnpm', [...d1Args(target), ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? ACCOUNT_ID },
  })
}

function readRows<T>(target: Target, sql: string): T[] {
  const out = runWrangler(target, ['--json', '--command', sql])
  const parsed = JSON.parse(out) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}

const literal = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`

async function confirmGithubName(move: KnownMove): Promise<RepositoryName> {
  const headers = new Headers({ 'Accept': 'application/vnd.github+json', 'User-Agent': 'skilld.dev move-repositories' })
  if (process.env.GITHUB_TOKEN)
    headers.set('Authorization', `Bearer ${process.env.GITHUB_TOKEN}`)
  const response = await fetch(`https://api.github.com/repositories/${move.repositoryId}`, { headers })
  if (!response.ok)
    throw new Error(`GitHub answered ${response.status} for Repository ${move.repositoryId} (${move.from.owner}/${move.from.repo}).`)
  const body = await response.json() as GithubRepository
  const [owner, repo] = body.full_name.split('/') as [string, string]
  if (body.id !== move.repositoryId || !sameRepositoryName({ owner, repo }, move.to)) {
    throw new Error(
      `Repository ${move.repositoryId} is ${body.full_name} on GitHub, not ${move.to.owner}/${move.to.repo}. Update KNOWN_MOVES first.`,
    )
  }
  return { owner, repo }
}

function heldName(target: Target, name: RepositoryName): HeldRepositoryName | null {
  const [row] = readRows<HeldRepositoryName>(target, `
    SELECT owner, repo, repository_id AS repositoryId FROM repos
    WHERE owner = ${literal(name.owner)} COLLATE NOCASE AND repo = ${literal(name.repo)} COLLATE NOCASE
    ORDER BY (owner = lower(${literal(name.owner)}) AND repo = lower(${literal(name.repo)})) DESC
    LIMIT 1`)
  return row ?? null
}

/** The move writes columns and a table that migration 0146 adds. */
function assertMigrated(target: Target): void {
  const [row] = readRows<{ migrated: number }>(target, `SELECT COUNT(*) AS migrated FROM pragma_table_info('repos') WHERE name = 'repository_id'`)
  if (!row?.migrated)
    throw new Error(`The ${target._tag} D1 lacks migration 0146_repository_moves.sql. Deploy first, then run this script.`)
}

function countRows(target: Target, name: RepositoryName): Record<string, number> {
  const counts = COUNTED_TABLES.map(([table, repo]) =>
    `(SELECT COUNT(*) FROM ${table} WHERE owner = ${literal(name.owner)} AND ${repo} = ${literal(name.repo)}) AS ${table}`)
  const [row] = readRows<Record<string, number>>(target, `SELECT ${counts.join(', ')}`)
  return row ?? {}
}

async function planMove(target: Target, known: KnownMove, reverse: boolean, movedAt: number): Promise<RepositoryMove> {
  const current = await confirmGithubName(known)
  const from = reverse ? movedRegistryName(current, heldName(target, current)) : known.from
  const name = reverse ? known.from : current
  // The same check sync runs: never merge into a row another Repository holds.
  const plan = planRepositoryMove(name, heldName(target, name), known.repositoryId)
  if (plan._tag === 'held')
    throw new Error(`The registry holds ${name.owner}/${name.repo} for Repository ${plan.heldBy}, not ${known.repositoryId}. Resolve that row first.`)
  return { from, to: plan.to, source: name, repositoryId: known.repositoryId, movedAt }
}

function describeCounts(counts: Record<string, number>): string {
  const moving = Object.entries(counts).filter(([, count]) => count > 0)
  return moving.length ? moving.map(([table, count]) => `${table} ${count}`).join(', ') : 'no rows'
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      local: { type: 'boolean', default: false },
      reverse: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  })
  const target: Target = values.local ? { _tag: 'local' } : { _tag: 'remote' }
  const outDir = resolve(values.out ?? join(tmpdir(), `skilld-repository-moves-${new Date().toISOString().slice(0, 10)}`))
  mkdirSync(outDir, { recursive: true })
  const movedAt = Math.floor(Date.now() / 1000)

  console.log(`${values.apply ? 'Apply' : 'Dry run'} against the ${target._tag} D1. SQL files go to ${outDir}.`)
  assertMigrated(target)
  const files: string[] = []
  for (const [index, known] of KNOWN_MOVES.entries()) {
    const move = await planMove(target, known, values.reverse, movedAt)
    const held = heldName(target, move.to)
    console.log(`\n${move.from.owner}/${move.from.repo} -> ${move.to.owner}/${move.to.repo} (Repository ${move.repositoryId})`)
    console.log(`  rows under the old name: ${describeCounts(countRows(target, move.from))}`)
    console.log(held
      ? `  the registry already holds ${held.owner}/${held.repo}: ${describeCounts(countRows(target, held))}. The rows merge, and a clash keeps that row.`
      : `  the registry does not hold the new name yet.`)
    const file = join(outDir, `${String(index + 1).padStart(2, '0')}-${move.from.owner}-${move.from.repo}.sql`)
    writeFileSync(file, `${repositoryMoveSql(move)}\n`)
    files.push(file)
  }

  if (!values.apply) {
    console.log(`\nDry run done. Wrote ${files.length} SQL files. Nothing changed.`)
    console.log(`To run them, add --apply${values.local ? ' --local' : ''}.`)
    return
  }

  for (const file of files) {
    console.log(`\nRunning ${file}`)
    runWrangler(target, ['--file', file, '--yes'])
  }
  console.log(`\nApplied ${files.length} moves. The redirects start when the alias cache expires, within 15 minutes.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
