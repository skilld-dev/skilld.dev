/**
 * Batch Voyage embedding prototype. Gets around the 3 RPM free-tier limit
 * by sending all skills in a single batched call. Writes rows to local D1
 * (or --remote) via wrangler.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/prototype-voyage-batch.ts
 *   npx tsx --env-file=.env scripts/prototype-voyage-batch.ts --remote
 */

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { remote: { type: 'boolean' }, limit: { type: 'string', default: '20' } } })
const REMOTE_FLAG = values.remote ? '--remote' : '--local'
const LIMIT = Math.max(1, Number(values.limit) || 20)

const VOYAGE_KEY = process.env.VOYAGE_API_KEY
if (!VOYAGE_KEY) {
  console.error('set VOYAGE_API_KEY via --env-file=.env')
  process.exit(1)
}

const EMBED_DIM = 512
const MODEL = 'voyage-3-lite'

function d1Exec(sql: string): unknown[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0)
    throw new Error(`wrangler d1 failed (${res.status}): ${res.stderr}`)
  return (JSON.parse(res.stdout)[0]?.results ?? []) as unknown[]
}

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
  const skillFiles = tree?.files?.filter(f => f.path.endsWith('SKILL.md')) ?? []
  const hit = skillFiles.find(f => f.path.endsWith(`/${name}/SKILL.md`) || f.path === `${name}/SKILL.md`)
    ?? (skillFiles.length === 1 ? skillFiles[0] : skillFiles.find(f => f.path.split('/').includes(name)))
  if (!hit)
    return null
  const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${hit.path}`).then(r => r.text()).catch(warnNull(`SKILL.md ${owner}/${repo}/${hit.path}`))
  return raw ? { raw, description: meta.repo.description } : null
}

function inputText(s: { displayName: string, description: string | null, raw: string }): string {
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

// 1. Pick skills: start from top-installs + any skill that already has a row
//    in skill_generated (so we fill in embeddings for ones we've touched).
const topSkills = d1Exec(`SELECT owner, repo, name, display_name FROM skills ORDER BY installs DESC LIMIT ${LIMIT}`) as { owner: string, repo: string, name: string, display_name: string }[]
console.log(`picked top-${LIMIT} skills by installs`)

const picked = topSkills
console.log(`fetching SKILL.md for ${picked.length} skills in parallel...`)

interface LoadedSkill { owner: string, repo: string, name: string, displayName: string, description: string | null, raw: string }
const loaded: LoadedSkill[] = []
await Promise.all(picked.map(async (s) => {
  const src = await fetchSkillMd(s.owner, s.repo, s.name)
  if (!src)
    return
  loaded.push({ owner: s.owner, repo: s.repo, name: s.name, displayName: s.display_name, description: src.description, raw: src.raw })
}))
console.log(`loaded ${loaded.length}/${picked.length}\n`)

const texts = loaded.map(inputText)
console.log(`one batched Voyage call: ${texts.length} inputs...`)
const vectors = await voyageBatch(texts)
console.log(`got ${vectors.length} vectors (dim=${vectors[0]?.length})\n`)

// 2. Write each row via a single batched wrangler INSERT statement.
const esc = (s: string) => s.replace(/'/g, '\'\'')
const rows: string[] = []
for (let i = 0; i < loaded.length; i++) {
  const s = loaded[i]!
  const v = vectors[i]!
  const payload = JSON.stringify({ vector: v, dim: v.length, model: MODEL })
  const sha = await sha1(`${MODEL}\n${texts[i]}`)
  rows.push(`('${esc(s.owner)}','${esc(s.repo)}','${esc(s.name)}','embedding','${sha}','${esc(payload)}','${new Date().toISOString()}')`)
}

// One INSERT per row; D1 has a per-statement size limit that a batched
// VALUES list blows past once vectors are big.
const statements = rows.map(r => `INSERT OR REPLACE INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES ${r};`)
const sql = statements.join('\n')
const tmpPath = `/tmp/voyage-seed-${Date.now()}.sql`
await import('node:fs').then(fs => fs.writeFileSync(tmpPath, sql))

const fileRes = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--file', tmpPath], {
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (fileRes.status !== 0) {
  console.error('stdout:', fileRes.stdout?.slice(0, 500))
  console.error('stderr:', fileRes.stderr?.slice(0, 500))
  throw new Error(`wrangler d1 file exec failed (${fileRes.status})`)
}
console.log(`wrote ${rows.length} embedding rows (${REMOTE_FLAG})`)
