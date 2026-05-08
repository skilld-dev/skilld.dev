/**
 * Emit SQL to backfill `skill_generated` (kind='abstractness') from a
 * classifier output JSONL produced by
 * `scripts/classify-skill-abstractness.ts`.
 *
 * Each line in the JSONL is:
 *   { key, name, owner, repo, description, kind, package, category, confidence }
 *
 * The persisted payload is `{ kind, package, category, confidence, model }`,
 * matching the shape future production jobs will write.
 *
 * `sha` is set to a stable backfill marker (`backfill:<contentHash>`) so the
 * proper job — when added — will detect drift against the real SKILL.md SHA
 * and regenerate.
 *
 * Usage:
 *   npx tsx scripts/backfill-abstractness.ts \
 *     | npx wrangler d1 execute skilld-db --local --file=-
 *
 * Remote:
 *   npx tsx scripts/backfill-abstractness.ts \
 *     | npx wrangler d1 execute skilld-db --remote --file=-
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const INPUT = process.argv[2] || '/tmp/skilld-ux/classifications.jsonl'
const MODEL = 'claude-haiku-4-5-20251001'
const NOW = new Date().toISOString()

interface ClassifiedRow {
  key: string
  name: string
  owner: string
  repo: string
  description: string
  kind: 'abstract' | 'package-specific'
  package: string | null
  category: string
  confidence: number
}

interface AbstractnessPayload {
  kind: 'abstract' | 'package-specific'
  package: string | null
  category: string
  confidence: number
  model: string
}

const SINGLE_QUOTE_RE = /'/g
const escape = (s: string): string => s.replace(SINGLE_QUOTE_RE, '\'\'')

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

const lines = readFileSync(INPUT, 'utf-8').split('\n').filter(Boolean)
const rows: string[] = []
let skipped = 0

for (const line of lines) {
  let row: ClassifiedRow
  try {
    row = JSON.parse(line) as ClassifiedRow
  }
  catch {
    skipped++
    continue
  }
  if (!row.owner || !row.name || !row.repo || !row.kind) {
    skipped++
    continue
  }

  const payload: AbstractnessPayload = {
    kind: row.kind,
    package: row.package ?? null,
    category: row.category,
    confidence: row.confidence,
    model: MODEL,
  }
  const sha = `backfill:${sha1(row.description)}`

  rows.push(
    `('${escape(row.owner)}','${escape(row.repo)}','${escape(row.name)}','abstractness','${sha}','${escape(JSON.stringify(payload))}','${NOW}')`,
  )
}

const BATCH = 200
process.stdout.write(`-- Backfill abstractness: ${rows.length} rows (${skipped} skipped)\n`)
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  process.stdout.write(
    `INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES\n${chunk.join(',\n')}\n`
    + `ON CONFLICT(owner, name, kind) DO UPDATE SET\n`
    + `  repo = excluded.repo,\n`
    + `  sha = excluded.sha,\n`
    + `  payload = excluded.payload,\n`
    + `  generated_at = excluded.generated_at;\n`,
  )
}

process.stderr.write(`emitted ${rows.length} rows in ${Math.ceil(rows.length / BATCH)} statements (skipped=${skipped})\n`)
