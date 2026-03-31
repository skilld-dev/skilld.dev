/**
 * Seed D1 skills table from skills-registry.json
 *
 * Usage:
 *   npx wrangler d1 execute skilld-db --local --file=migrations/0001_skills.sql
 *   npx tsx scripts/seed-skills.ts | npx wrangler d1 execute skilld-db --local --file=-
 *
 * For remote:
 *   npx wrangler d1 execute skilld-db --remote --file=migrations/0001_skills.sql
 *   npx tsx scripts/seed-skills.ts | npx wrangler d1 execute skilld-db --remote --file=-
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface Registry {
  sources: string[]
  skills: [name: string, sourceIdx: number, displayName: string, installs: number][]
}

const raw = readFileSync(resolve(import.meta.dirname!, '../server/data/skills-registry.json'), 'utf-8')
const registry: Registry = JSON.parse(raw)

const SINGLE_QUOTE_RE = /'/g
const escape = (s: string) => s.replace(SINGLE_QUOTE_RE, '\'\'')

const BATCH = 500
const rows = registry.skills.map(([name, sourceIdx, displayName, installs]) => {
  const source = registry.sources[sourceIdx]!
  const slashIdx = source.indexOf('/')
  const owner = source.slice(0, slashIdx)
  const repo = source.slice(slashIdx + 1)
  const slug = `${owner}/${name}`
  return `('${escape(name)}','${escape(owner)}','${escape(repo)}','${escape(displayName)}',${installs},'${escape(slug)}')`
})

process.stdout.write('DELETE FROM skills;\nDELETE FROM skills_fts;\n')

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  process.stdout.write(`INSERT OR REPLACE INTO skills (name, owner, repo, display_name, installs, slug) VALUES\n${chunk.join(',\n')};\n`)
}
