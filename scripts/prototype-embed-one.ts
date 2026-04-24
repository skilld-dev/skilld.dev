/**
 * Embed a single skill by slug (via Voyage), writing to both local and
 * remote D1. Useful to top up specific skills without re-running the full
 * batch. Tag assignment is NOT done here — run prototype-embed-tags after.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/prototype-embed-one.ts --slug owner/name
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { slug: { type: 'string' } } })
if (!values.slug) {
  console.error('--slug owner/name required')
  process.exit(1)
}
const SLUG = values.slug
const KEY = process.env.VOYAGE_API_KEY
if (!KEY) {
  console.error('VOYAGE_API_KEY missing')
  process.exit(1)
}

function d1<T>(flag: '--local' | '--remote', sql: string): T[] {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', flag, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (r.status !== 0)
    throw new Error(r.stderr)
  return (JSON.parse(r.stdout)[0]?.results ?? []) as T[]
}

function d1File(flag: '--local' | '--remote', file: string): void {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', flag, '--file', file], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (r.status !== 0) {
    console.error(flag, 'failed:', r.stderr?.slice(0, 400))
    throw new Error(`d1 file exec failed (${flag})`)
  }
}

async function sha1(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const skill = d1<{ owner: string, repo: string, name: string, display_name: string }>(
  '--local',
  `SELECT owner, repo, name, display_name FROM skills WHERE slug = '${SLUG.replace(/'/g, '\'\'')}'`,
)[0]
if (!skill)
  throw new Error(`skill not found: ${SLUG}`)
console.log('found:', `${skill.owner}/${skill.name}`, 'repo:', skill.repo)

const meta = await fetch(`https://ungh.cc/repos/${skill.owner}/${skill.repo}`).then(r => r.json() as Promise<{ repo?: { defaultBranch: string, description: string | null } }>)
if (!meta.repo)
  throw new Error('repo not found')
const branch = meta.repo.defaultBranch
const tree = await fetch(`https://ungh.cc/repos/${skill.owner}/${skill.repo}/files/${branch}`).then(r => r.json() as Promise<{ files?: { path: string }[] }>)
const skillFiles = tree.files?.filter(f => f.path.endsWith('SKILL.md')) ?? []
const hit = skillFiles.find(f => f.path.endsWith(`/${skill.name}/SKILL.md`) || f.path === `${skill.name}/SKILL.md`)
  ?? (skillFiles.length === 1 ? skillFiles[0] : skillFiles.find(f => f.path.split('/').includes(skill.name)))
if (!hit)
  throw new Error('no SKILL.md')
const raw = await fetch(`https://raw.githubusercontent.com/${skill.owner}/${skill.repo}/${branch}/${hit.path}`).then(r => r.text())
console.log('SKILL.md chars:', raw.length)

const text = `${skill.display_name}\n${meta.repo.description || ''}\n\n${raw.slice(0, 500)}`.trim()

const emb = await fetch('https://api.voyageai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization': `Bearer ${KEY}` },
  body: JSON.stringify({ input: [text], model: 'voyage-3-lite', output_dimension: 512 }),
})
if (!emb.ok)
  throw new Error(`voyage ${emb.status}: ${await emb.text()}`)
const ed = await emb.json() as { data: { embedding: number[] }[] }
const vector = ed.data[0]!.embedding
console.log('embedded dim:', vector.length)

const payloadSha = await sha1(`voyage-3-lite\n${text}`)
const payload = JSON.stringify({ vector, dim: vector.length, model: 'voyage-3-lite' })
const esc = (s: string) => s.replace(/'/g, '\'\'')
const sql = `INSERT OR REPLACE INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES ('${esc(skill.owner)}','${esc(skill.repo)}','${esc(skill.name)}','embedding','${payloadSha}','${esc(payload)}','${new Date().toISOString()}');`
const tmp = `/tmp/embed-one-${Date.now()}.sql`
writeFileSync(tmp, sql)

for (const flag of ['--local', '--remote'] as const) {
  d1File(flag, tmp)
  console.log(flag, 'ok')
}
