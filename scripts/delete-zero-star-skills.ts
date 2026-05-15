/**
 * Generate SQL to delete skills with stars=0 OR broken_since IS NOT NULL,
 * cascading to skill_revisions, skill_generated, activity, skill_social_posts.
 *
 * Reads target rows (owner, repo, name, slug) from stdin as TSV (one per line).
 * `repo` is required since 0033 — same (owner, name) under different repos are
 * distinct skills, so an (owner, name)-only DELETE would wipe siblings.
 *
 * Emits SQL on stdout; pipe to:
 *   wrangler d1 execute skilld-db --remote --file=/tmp/delete.sql
 */

import { readFileSync } from 'node:fs'

const BATCH = 200

const SQUOTE_RE = /'/g
const escape = (s: string) => `'${s.replace(SQUOTE_RE, '\'\'')}'`

const input = readFileSync(0, 'utf-8')
const rows = input.split('\n').map(l => l.trim()).filter(Boolean).map((line) => {
  const parts = line.split('\t')
  if (parts.length < 4) {
    console.error(`[delete-sql] invalid TSV line (need owner\\trepo\\tname\\tslug): ${line}`)
    process.exit(1)
  }
  const [owner, repo, name, slug] = parts as [string, string, string, string]
  return { owner, repo, name, slug }
})

console.error(`[delete-sql] ${rows.length} rows targeted`)

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const tuples = batch.map(r => `(${escape(r.owner)},${escape(r.repo)},${escape(r.name)})`).join(',')
  const slugs = batch.map(r => escape(r.slug)).join(',')

  console.log(`DELETE FROM skill_revisions WHERE (owner,repo,name) IN (${tuples});`)
  console.log(`DELETE FROM skill_generated WHERE (owner,repo,name) IN (${tuples});`)
  console.log(`DELETE FROM activity WHERE (owner,repo,name) IN (${tuples});`)
  console.log(`DELETE FROM skill_social_posts WHERE skill_slug IN (${slugs});`)
  console.log(`DELETE FROM skills WHERE (owner,repo,name) IN (${tuples});`)
}
