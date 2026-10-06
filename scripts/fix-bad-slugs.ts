/**
 * One-off cleanup: rename rows in `skills` whose `name` column contains
 * non-slug characters (uppercase, spaces, parens, etc.). These were created
 * by the old parseSkillFile which used SKILL.md frontmatter `name:` as the
 * slug, but that field is often a display title (e.g. "Test-Driven
 * Development (TDD)") rather than a slug.
 *
 * Strategy:
 *   1. Pull every row whose name doesn't match `/^[a-z0-9][a-z0-9-]*$/`.
 *   2. Compute the corrected slug via slugifySkillName.
 *   3. If (owner, repo, new_slug) collides with an existing row, keep the
 *      existing canonical row. Otherwise update in place.
 *   4. Emit SQL on stdout. Pipe to wrangler.
 *
 * Usage:
 *   npx tsx scripts/fix-bad-slugs.ts | npx wrangler d1 execute skilld-db --remote --file=-
 */

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { slugifySkillName } from '../shared/skill-path'

interface BadRow {
  owner: string
  repo: string
  name: string
}

interface CleanRow {
  owner: string
  repo: string
  name: string
}

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')
const sqlText = (s: string) => `'${escape(s)}'`

function d1<T>(sql: string): T[] {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'skilld-db', '--remote', '--json', '--command', sql],
    {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: '5904138d55ca25d5670dca6adf99894e' },
    },
  )
  const parsed = JSON.parse(out) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}

console.error('[fix-bad-slugs] querying bad rows...')
const bad = d1<BadRow>(
  `SELECT owner, repo, name FROM skills WHERE name GLOB '*[^a-z0-9-]*'`,
)
console.error(`[fix-bad-slugs] ${bad.length} bad rows`)

console.error('[fix-bad-slugs] querying clean rows for collision check...')
const clean = d1<CleanRow>(
  `SELECT owner, repo, name FROM skills WHERE name NOT GLOB '*[^a-z0-9-]*'`,
)
// Collision key is `(owner, repo, name)` — same owner/name across different
// repos are now legal rows (post-0033) and must NOT be merged.
const cleanIndex = new Map<string, CleanRow>()
for (const row of clean)
  cleanIndex.set(`${row.owner}/${row.repo}/${row.name}`, row)
console.error(`[fix-bad-slugs] ${clean.length} clean rows indexed`)

let renames = 0
let merges = 0
let unchanged = 0

console.log('-- fix-bad-slugs cleanup')

for (const row of bad) {
  const newName = slugifySkillName(row.name)
  if (!newName) {
    console.log(
      `DELETE FROM skills WHERE owner = ${sqlText(row.owner)} AND repo = ${sqlText(row.repo)} AND name = ${sqlText(row.name)};`,
    )
    unchanged++
    continue
  }
  if (newName === row.name) {
    unchanged++
    continue
  }

  const collisionKey = `${row.owner}/${row.repo}/${newName}`
  const collision = cleanIndex.get(collisionKey)

  if (collision) {
    // The existing clean row remains canonical.
    console.log(
      `DELETE FROM skills WHERE owner = ${sqlText(row.owner)} AND repo = ${sqlText(row.repo)} AND name = ${sqlText(row.name)};`,
    )
    merges++
  }
  else {
    // Rename in place.
    console.log(
      `UPDATE skills SET name = ${sqlText(newName)}, slug = ${sqlText(`${row.owner}/${newName}`)} `
      + `WHERE owner = ${sqlText(row.owner)} AND repo = ${sqlText(row.repo)} AND name = ${sqlText(row.name)};`,
    )
    cleanIndex.set(collisionKey, { owner: row.owner, repo: row.repo, name: newName })
    renames++
  }
}

console.error(`[fix-bad-slugs] renames=${renames} merges=${merges} unchanged=${unchanged}`)
