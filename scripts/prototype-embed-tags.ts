/**
 * Assign tags to every skill with a stored embedding, using cosine similarity
 * against Voyage-embedded taxonomy centroids. Writes tag rows to D1, one
 * batched Voyage call for the 30 taxonomy entries + whatever skill rows are
 * missing embeddings.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/prototype-embed-tags.ts [--remote]
 *
 * Strategy: top-3 picks where score >= top * 0.9 AND score >= 0.30.
 * Tuned from the calibration run — voyage similarities sit in 0.25-0.50
 * for this corpus, so a relative threshold beats an absolute floor.
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { TAXONOMY } from '../server/jobs/taxonomy'

const { values } = parseArgs({ options: { remote: { type: 'boolean' } } })
const REMOTE_FLAG = values.remote ? '--remote' : '--local'
const VOYAGE_KEY = process.env.VOYAGE_API_KEY
if (!VOYAGE_KEY) {
  console.error('set VOYAGE_API_KEY via --env-file=.env')
  process.exit(1)
}

const MODEL = 'voyage-3-lite'
const REL_THRESHOLD = 0.90
const ABS_FLOOR = 0.30
const MAX_TAGS = 3

function d1Query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0)
    throw new Error(`wrangler d1 failed: ${res.stderr}`)
  return (JSON.parse(res.stdout)[0]?.results ?? []) as T[]
}

function d1File(sql: string): void {
  const tmp = `/tmp/embed-tags-${Date.now()}.sql`
  writeFileSync(tmp, sql)
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--file', tmp], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error('stderr:', res.stderr?.slice(0, 500))
    throw new Error(`wrangler d1 file exec failed (${res.status})`)
  }
}

async function voyageBatch(inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${VOYAGE_KEY}` },
    body: JSON.stringify({ input: inputs, model: MODEL, output_dimension: 512 }),
  })
  if (!res.ok)
    throw new Error(`Voyage ${res.status}: ${await res.text()}`)
  const data = await res.json() as { data: { embedding: number[] }[] }
  return data.data.map(d => d.embedding)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

const TAXONOMY_STOPWORDS = new Set(['documentation', 'api']) // bias-prone, only pick if dominant

// 1. Load skill embeddings
const rows = d1Query<{ owner: string, repo: string, name: string, payload: string }>(
  'SELECT owner, repo, name, payload FROM skill_generated WHERE kind = \'embedding\'',
)
console.log(`loaded ${rows.length} skill embeddings`)

// 2. Embed taxonomy in a single call
console.log('embedding taxonomy (1 voyage call)...')
const taxVectors = await voyageBatch(TAXONOMY.map(t => `${t.label}\n${t.description}`))
const centroids = TAXONOMY.map((t, i) => ({ slug: t.slug, vec: taxVectors[i]! }))

// 3. Score + pick
const sqlStatements: string[] = []
const esc = (s: string) => s.replace(/'/g, '\'\'')

for (const r of rows) {
  const skillVec = (JSON.parse(r.payload) as { vector: number[] }).vector
  const scored = centroids
    .map(c => ({ slug: c.slug, score: cosine(skillVec, c.vec) }))
    .sort((a, b) => b.score - a.score)

  const top = scored[0]!.score
  // Pick anything within REL_THRESHOLD of top and above ABS_FLOOR, max MAX_TAGS.
  // Stopwords can only appear if they're clearly dominant (within 0.02 of top).
  const picks: string[] = []
  for (const s of scored) {
    if (picks.length >= MAX_TAGS)
      break
    if (s.score < ABS_FLOOR)
      break
    if (s.score < top * REL_THRESHOLD)
      break
    if (TAXONOMY_STOPWORDS.has(s.slug) && top - s.score > 0.02)
      continue
    picks.push(s.slug)
  }

  if (!picks.length) {
    console.log(`  skip ${r.owner}/${r.name} — no tag above threshold (top=${top.toFixed(3)})`)
    continue
  }

  console.log(`  ${r.owner}/${r.name}: ${picks.join(', ')}  [top-3: ${scored.slice(0, 3).map(x => `${x.slug}:${x.score.toFixed(3)}`).join(', ')}]`)

  const payload = JSON.stringify({ tags: picks, model: `embed:${MODEL}` })
  const textSha = `embed:${MODEL}:${picks.join(',')}` // stable for the same picks; regen when picks change
  sqlStatements.push(
    `INSERT OR REPLACE INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES ('${esc(r.owner)}','${esc(r.repo)}','${esc(r.name)}','tags','${textSha}','${esc(payload)}','${new Date().toISOString()}');`,
  )
}

if (!sqlStatements.length) {
  console.log('\nno tag rows to write')
  process.exit(0)
}

d1File(sqlStatements.join('\n'))
console.log(`\nwrote ${sqlStatements.length} tag rows (${REMOTE_FLAG})`)
