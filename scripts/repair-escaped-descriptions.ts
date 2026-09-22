/**
 * Repair skill descriptions stored before the frontmatter parser decoded YAML.
 *
 * The old parser stripped the surrounding quotes off a double-quoted scalar and
 * kept the raw bytes, so `description: "... importing \"pinia\"."` was stored
 * with the backslashes intact. The fixed parser decodes the scalar, but a
 * repository sync skips a repository whose tree SHA is unchanged, so a stored
 * row is never re-parsed on its own.
 *
 * The Skill detail page re-parses `rendered_raw` on every request, so it heals
 * as soon as the fix deploys. The denormalised `skills.description` column,
 * which feeds the list API, search, and the CLI picker, does not. This script
 * repairs that column from the same `rendered_raw` bytes already in D1, so it
 * needs no GitHub token and reads the exact source the row was built from.
 *
 * The old parser also truncated scalars wrapped onto continuation lines and
 * stored undecoded escapes in `display_name`, and neither shape carries a
 * backslash or a quote to select on. So the selector takes every row that
 * still carries `rendered_raw`: a row whose stored values already match the
 * bytes parses to no UPDATE at all.
 *
 * Emits SQL on stdout and progress on stderr. It writes nothing itself.
 *
 * Usage:
 *   npx tsx scripts/repair-escaped-descriptions.ts 5000 \
 *     | npx wrangler d1 execute skilld-db --remote --file=-
 */

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseSkillFile } from '#layers/registry/server/utils/skill-frontmatter'

const LIMIT = Number.parseInt(process.argv[2] ?? '5000', 10)
const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'

interface SkillRow {
  owner: string
  repo: string
  name: string
  display_name: string | null
  description: string | null
  rendered_raw: string | null
  rendered_skill_path: string | null
}

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')

/** SQL `IS` predicate pinning a column to the stale value the row was read with. */
function staleGuard(value: string | null): string {
  return value === null ? 'IS NULL' : `IS '${escape(value)}'`
}

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

export type RepairQuery = <T>(sql: string) => T[]

export interface RepairEscapedDescriptionsDependencies {
  query: RepairQuery
  emit: (sql: string) => void
  limit: number
}

export interface RepairEscapedDescriptionsSummary {
  candidates: number
  repaired: number
  unchanged: number
  unparsed: number
}

export function runRepairEscapedDescriptions(
  deps: RepairEscapedDescriptionsDependencies,
): RepairEscapedDescriptionsSummary {
  console.error('[repair] querying every row that still carries rendered raw bytes...')
  const rows = deps.query<SkillRow>(
    `SELECT owner, repo, name, display_name, description, rendered_raw, rendered_skill_path
     FROM skills
     WHERE rendered_raw IS NOT NULL
     ORDER BY owner ASC, repo ASC, name ASC
     LIMIT ${deps.limit}`,
  )
  console.error(`[repair] ${rows.length} candidate rows`)

  console.log('-- repair-escaped-descriptions')

  let repaired = 0
  let unchanged = 0
  let unparsed = 0

  for (const row of rows) {
    // sync-repo stores a root-level SKILL.md with the path exactly 'SKILL.md'
    // and names that skill after the repository, so the directory that decides
    // the slug is the repository name, never the file name.
    const dirName = row.rendered_skill_path === 'SKILL.md'
      ? row.repo
      : row.rendered_skill_path?.replace(/\/SKILL\.md$/, '').split('/').at(-1) ?? row.name
    const parsed = parseSkillFile(row.rendered_raw!, dirName)
    if (!parsed) {
      unparsed++
      continue
    }

    const sets: string[] = []
    if (parsed.description && parsed.description !== row.description)
      sets.push(`description = '${escape(parsed.description)}'`)
    if (parsed.displayName && parsed.displayName !== row.display_name)
      sets.push(`display_name = '${escape(parsed.displayName)}'`)
    if (!sets.length) {
      unchanged++
      continue
    }

    // The WHERE guard pins the stale values. If a repository sync corrects the
    // row first, the UPDATE matches nothing instead of overwriting fresher text.
    deps.emit(
      `UPDATE skills SET ${sets.join(', ')} `
      + `WHERE owner = '${escape(row.owner)}' AND repo = '${escape(row.repo)}' AND name = '${escape(row.name)}' `
      + `AND description ${staleGuard(row.description)} `
      + `AND display_name ${staleGuard(row.display_name)};`,
    )
    repaired++
  }

  console.error(`[repair] done. repaired=${repaired} unchanged=${unchanged} unparsed=${unparsed} of ${rows.length}`)
  return { candidates: rows.length, repaired, unchanged, unparsed }
}

function main(): void {
  runRepairEscapedDescriptions({
    limit: LIMIT,
    query: d1,
    emit: sql => console.log(sql),
  })
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url))
  main()
