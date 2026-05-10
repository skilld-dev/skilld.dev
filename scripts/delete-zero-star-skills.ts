/**
 * Generate SQL to delete skills with stars=0 OR broken_since IS NOT NULL,
 * cascading to skill_revisions, skill_generated, activity, skill_social_posts.
 *
 * Reads target rows (owner, name, slug) from stdin as TSV (one per line).
 * Emits SQL on stdout; pipe to:
 *   wrangler d1 execute skilld-db --remote --file=/tmp/delete.sql
 */

import { readFileSync } from 'node:fs'

const BATCH = 200

const SQUOTE_RE = /'/g
const escape = (s: string) => `'${s.replace(SQUOTE_RE, '\'\'')}'`

const input = readFileSync(0, 'utf-8')
const rows = input.split('\n').map(l => l.trim()).filter(Boolean).map((line) => {
  const [owner, name, slug] = line.split('\t') as [string, string, string]
  return { owner, name, slug }
})

console.error(`[delete-sql] ${rows.length} rows targeted`)

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const tuples = batch.map(r => `(${escape(r.owner)},${escape(r.name)})`).join(',')
  const slugs = batch.map(r => escape(r.slug)).join(',')

  console.log(`DELETE FROM skill_revisions WHERE (owner,name) IN (${tuples});`)
  console.log(`DELETE FROM skill_generated WHERE (owner,name) IN (${tuples});`)
  console.log(`DELETE FROM activity WHERE (owner,name) IN (${tuples});`)
  console.log(`DELETE FROM skill_social_posts WHERE skill_slug IN (${slugs});`)
  console.log(`DELETE FROM skills WHERE (owner,name) IN (${tuples});`)
}
