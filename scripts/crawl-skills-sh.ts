import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  buildSkillsShImportSql,
  crawlSkillsSh,
  parseSkillsShCrawlArgs,
  summarizeSkillsShEntries,
} from './lib/skills-sh-crawler'

const execFileAsync = promisify(execFile)

const usage = `Crawl skills.sh for GitHub repository discovery signals.

Usage:
  pnpm crawl:skills-sh
  pnpm crawl:skills-sh -- --view=trending --limit=100
  pnpm crawl:skills-sh -- --emit-sql
  pnpm crawl:skills-sh -- --apply=local
  pnpm crawl:skills-sh -- --apply=remote

Options:
  --view=all|trending|all-time  Views to crawl. Repeatable. Default: all
  --limit=1..500                Maximum visible skills per view. Default: 500
  --emit-sql                    Print replay-safe import SQL
  --apply=local|remote          Apply through the local Wrangler binary
  --help                        Show this help`

async function applyImportSql(
  sql: string,
  target: 'local' | 'remote',
): Promise<{ stdout: string, stderr: string }> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'skilld-skills-sh-'))
  const sqlPath = join(temporaryDirectory, 'import.sql')
  const cleanup = () => rm(temporaryDirectory, { force: true, recursive: true })
    // Temporary cleanup failure does not invalidate a completed D1 import.
    .catch((error: unknown) => console.warn(
      `[skills-sh] unable to remove ${temporaryDirectory}:`,
      error instanceof Error ? error.message : String(error),
    ))

  return writeFile(sqlPath, sql, 'utf8')
    .then(() => execFileAsync(
      resolve('node_modules/.bin/wrangler'),
      [
        'd1',
        'execute',
        'DB',
        target === 'local' ? '--local' : '--remote',
        '--config',
        resolve('wrangler.jsonc'),
        '--file',
        sqlPath,
        '--yes',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    ))
    .finally(cleanup)
}

async function main(): Promise<void> {
  const args = parseSkillsShCrawlArgs(process.argv.slice(2))
  if (args._tag === 'help') {
    console.log(usage)
    return
  }
  if (args._tag === 'error') {
    console.error(`[skills-sh] ${args.reason}\n\n${usage}`)
    process.exitCode = 1
    return
  }

  const crawledAt = Math.floor(Date.now() / 1_000)
  const crawl = await crawlSkillsSh(args.options, crawledAt)
  if (crawl._tag === 'error') {
    console.error(`[skills-sh] ${crawl.view}: ${crawl.reason}: ${crawl.detail}`)
    process.exitCode = 1
    return
  }

  const runId = `skills-sh-${new Date(crawledAt * 1_000).toISOString()}-${randomUUID()}`
  const summary = {
    runId,
    crawledAt,
    ...summarizeSkillsShEntries(crawl.entries),
    ignoredWellKnown: crawl.ignoredWellKnown,
  }
  const sql = buildSkillsShImportSql({
    runId,
    crawledAt,
    completedAt: Math.floor(Date.now() / 1_000),
    entries: crawl.entries,
    ignoredWellKnown: crawl.ignoredWellKnown,
  })

  if (args.options.emitSql) {
    console.error(JSON.stringify({ mode: 'emit-sql', ...summary }))
    process.stdout.write(sql)
    return
  }
  if (!args.options.apply) {
    console.log(JSON.stringify({ mode: 'dry-run', ...summary }, null, 2))
    return
  }

  const applied = await applyImportSql(sql, args.options.apply)
  if (applied.stderr.trim())
    console.error(applied.stderr.trim())
  console.log(JSON.stringify({
    mode: `applied-${args.options.apply}`,
    ...summary,
    wrangler: applied.stdout.trim(),
  }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
