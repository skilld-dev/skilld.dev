/**
 * Voyage embeddings for an explicit slug list. One batched API call,
 * one D1 file write. Targets the gap left after sync-skills-gh: new
 * skills that have no embedding row yet.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/voyage-batch-slugs.ts --slugs-file /tmp/user-tier-slugs-only.txt --remote
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'slugs-file': { type: 'string' },
    'remote': { type: 'boolean' },
  },
})

const slugsFile = values['slugs-file']
if (!slugsFile) {
  console.error('--slugs-file required')
  process.exit(1)
}

const REMOTE_FLAG = values.remote ? '--remote' : '--local'
const VOYAGE_KEY = process.env.VOYAGE_API_KEY
if (!VOYAGE_KEY) {
  console.error('set VOYAGE_API_KEY via --env-file=.env')
  process.exit(1)
}

const EMBED_DIM = 512
const MODEL = 'voyage-3-lite'
const BATCH_SIZE = 128 // Voyage allows up to 128 inputs per request

const slugs = readFileSync(slugsFile, 'utf-8').split('\n').map(s => s.trim()).filter(Boolean)
if (!slugs.length) {
  console.error('no slugs in file')
  process.exit(1)
}
console.log(`${slugs.length} slugs from ${slugsFile} → ${REMOTE_FLAG}`)

function d1Exec(sql: string): unknown[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0)
    throw new Error(`wrangler d1 failed (${res.status}): ${res.stderr}`)
  return (JSON.parse(res.stdout)[0]?.results ?? []) as unknown[]
}

const inClause = slugs.map(s => `'${s.replace(/'/g, '\'\'')}'`).join(',')
const rows = d1Exec(
  `SELECT owner, repo, name, display_name FROM skills WHERE slug IN (${inClause})`,
) as { owner: string, repo: string, name: string, display_name: string }[]
console.log(`matched ${rows.length}/${slugs.length} skills in D1`)

interface Loaded { owner: string, repo: string, name: string, displayName: string, description: string | null, raw: string }

// Prototype fetches degrade to null so one unreachable repo does not stop the
// batch, but the reason has to reach the operator or a run of empty results
// looks like "no skills found" instead of "the network was down".
function warnNull(label: string) {
  return (error: unknown) => {
    console.warn(`[${label}] ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

async function fetchSkillMd(owner: string, repo: string, name: string): Promise<{ raw: string, description: string | null } | null> {
  const meta = await fetch(`https://ungh.cc/repos/${owner}/${repo}`).then(r => r.json() as Promise<{ repo?: { defaultBranch: string, description: string | null } }>).catch(warnNull(`repo meta ${owner}/${repo}`))
  if (!meta?.repo)
    return null
  const branch = meta.repo.defaultBranch
  const tree = await fetch(`https://ungh.cc/repos/${owner}/${repo}/files/${branch}`).then(r => r.json() as Promise<{ files?: { path: string }[] }>).catch(warnNull(`repo tree ${owner}/${repo}@${branch}`))
  const files = tree?.files?.filter(f => f.path.endsWith('SKILL.md')) ?? []
  const hit = files.find(f => f.path.endsWith(`/${name}/SKILL.md`) || f.path === `${name}/SKILL.md`)
    ?? (files.length === 1 ? files[0] : files.find(f => f.path.split('/').includes(name)))
  if (!hit)
    return null
  const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${hit.path}`).then(r => r.text()).catch(warnNull(`SKILL.md ${owner}/${repo}/${hit.path}`))
  return raw ? { raw, description: meta.repo.description } : null
}

console.log('fetching SKILL.md content (parallel)...')
const loaded: Loaded[] = []
await Promise.all(rows.map(async (r) => {
  const src = await fetchSkillMd(r.owner, r.repo, r.name)
  if (!src)
    return
  loaded.push({ owner: r.owner, repo: r.repo, name: r.name, displayName: r.display_name, description: src.description, raw: src.raw })
}))
console.log(`loaded ${loaded.length}/${rows.length} (skipped ${rows.length - loaded.length})`)

if (!loaded.length) {
  console.error('nothing loaded')
  process.exit(1)
}

function inputText(s: Loaded): string {
  const head = s.raw.slice(0, 500)
  const desc = s.description ? `${s.description}\n\n` : ''
  return `${s.displayName}\n${desc}${head}`.trim()
}

async function sha1(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function voyageBatch(inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${VOYAGE_KEY}` },
    body: JSON.stringify({ input: inputs, model: MODEL, output_dimension: EMBED_DIM }),
  })
  if (!res.ok)
    throw new Error(`Voyage ${res.status}: ${await res.text().catch(() => '')}`)
  const data = await res.json() as { data: { embedding: number[] }[] }
  return data.data.map(d => d.embedding)
}

const texts = loaded.map(inputText)
const vectors: number[][] = []
for (let i = 0; i < texts.length; i += BATCH_SIZE) {
  const batch = texts.slice(i, i + BATCH_SIZE)
  console.log(`Voyage batch ${i / BATCH_SIZE + 1}: ${batch.length} inputs...`)
  const v = await voyageBatch(batch)
  vectors.push(...v)
}
console.log(`got ${vectors.length} vectors (dim=${vectors[0]?.length})`)

const esc = (s: string) => s.replace(/'/g, '\'\'')
const statements: string[] = []
for (let i = 0; i < loaded.length; i++) {
  const s = loaded[i]!
  const v = vectors[i]!
  const payload = JSON.stringify({ vector: v, dim: v.length, model: MODEL })
  const sha = await sha1(`${MODEL}\n${texts[i]}`)
  statements.push(
    `INSERT OR REPLACE INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES ('${esc(s.owner)}','${esc(s.repo)}','${esc(s.name)}','embedding','${sha}','${esc(payload)}','${new Date().toISOString()}');`,
  )
}

const tmpPath = `/tmp/voyage-slugs-${Date.now()}.sql`
writeFileSync(tmpPath, statements.join('\n'))
console.log(`wrote ${statements.length} INSERTs to ${tmpPath}, applying...`)

const fileRes = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--file', tmpPath], {
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (fileRes.status !== 0) {
  console.error('stdout:', fileRes.stdout?.slice(0, 500))
  console.error('stderr:', fileRes.stderr?.slice(0, 500))
  throw new Error(`wrangler d1 file exec failed (${fileRes.status})`)
}
console.log(`done (${REMOTE_FLAG}). Skipped ${rows.length - loaded.length}.`)
