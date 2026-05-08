/**
 * Voyage-based tag calibration — prototype only, runs on the 9 skills we
 * already have claude-tags for. Compares embed-picked tags vs claude picks.
 *
 * Usage:
 *   node --env-file=.env --import=tsx scripts/prototype-tags-embed.ts
 */

import { spawnSync } from 'node:child_process'
import { TAXONOMY } from '../layers/registry/server/jobs/taxonomy'

const VOYAGE_KEY = process.env.VOYAGE_API_KEY
if (!VOYAGE_KEY) {
  console.error('set VOYAGE_API_KEY (via --env-file=.env or export)')
  process.exit(1)
}

const EMBED_DIM = 512
const MARGIN = 0.02
const FLOOR = 0.40 // real embeddings have much higher magnitudes than hash fallback

function d1Query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', '--local', '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0)
    throw new Error(`wrangler d1 exec failed (${res.status}): ${res.stderr}`)
  return (JSON.parse(res.stdout)[0]?.results ?? []) as T[]
}

async function voyageEmbed(inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${VOYAGE_KEY}` },
    body: JSON.stringify({ input: inputs, model: 'voyage-3-lite', output_dimension: EMBED_DIM }),
  })
  if (!res.ok)
    throw new Error(`Voyage ${res.status}: ${await res.text().catch(() => '')}`)
  const data = await res.json() as { data: { embedding: number[] }[] }
  return data.data.map(d => d.embedding)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

// 1. Load skills: we want the ones that have claude-tags, plus their raw SKILL.md
//    text. Raw text isn't in skill_generated; re-fetch from GitHub for just those 9.
interface TaggedSkill { owner: string, repo: string, name: string, displayName: string, description: string | null, raw: string, claudeTags: string[] }

const claudeTagRows = d1Query<{ owner: string, repo: string, name: string, payload: string }>(
  'SELECT owner, repo, name, payload FROM skill_generated WHERE kind = \'tags\'',
).filter(r => !(JSON.parse(r.payload) as { model: string }).model.startsWith('embed:'))

console.log(`found ${claudeTagRows.length} claude-tagged skills — fetching SKILL.md for each...\n`)

async function fetchRaw(owner: string, repo: string, name: string): Promise<{ raw: string, description: string | null } | null> {
  const meta = await fetch(`https://ungh.cc/repos/${owner}/${repo}`).then(r => r.json() as Promise<{ repo?: { defaultBranch: string, description: string | null } }>).catch(() => null)
  if (!meta?.repo)
    return null
  const branch = meta.repo.defaultBranch
  const tree = await fetch(`https://ungh.cc/repos/${owner}/${repo}/files/${branch}`).then(r => r.json() as Promise<{ files?: { path: string }[] }>).catch(() => null)
  const skillFiles = tree?.files?.filter(f => f.path.endsWith('SKILL.md')) ?? []
  const hit = skillFiles.find(f => f.path.endsWith(`/${name}/SKILL.md`) || f.path === `${name}/SKILL.md`)
    ?? (skillFiles.length === 1 ? skillFiles[0] : skillFiles.find(f => f.path.split('/').includes(name)))
  if (!hit)
    return null
  const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${hit.path}`).then(r => r.text()).catch(() => null)
  return raw ? { raw, description: meta.repo.description } : null
}

function skillInputText(s: { displayName: string, description: string | null, raw: string }): string {
  const head = s.raw.slice(0, 500)
  const desc = s.description ? `${s.description}\n\n` : ''
  return `${s.displayName}\n${desc}${head}`.trim()
}

const skills: TaggedSkill[] = []
// Targeted display_name fetch — scoped to just the tagged skills, avoids
// dumping the full 14k-row skills table through wrangler (flaky at that size).
const displayNames = new Map<string, string>()
const ownerNames = claudeTagRows.map(r => `('${r.owner.replace(/'/g, '\'\'')}','${r.name.replace(/'/g, '\'\'')}')`).join(',')
if (ownerNames) {
  for (const r of d1Query<{ owner: string, name: string, display_name: string }>(
    `SELECT owner, name, display_name FROM skills WHERE (owner, name) IN (VALUES ${ownerNames})`,
  ))
    displayNames.set(`${r.owner}/${r.name}`, r.display_name)
}

for (const r of claudeTagRows) {
  const src = await fetchRaw(r.owner, r.repo, r.name)
  if (!src) {
    console.log(`  skip ${r.owner}/${r.name} — no SKILL.md`)
    continue
  }
  skills.push({
    owner: r.owner,
    repo: r.repo,
    name: r.name,
    displayName: displayNames.get(`${r.owner}/${r.name}`) ?? r.name,
    description: src.description,
    raw: src.raw,
    claudeTags: (JSON.parse(r.payload) as { tags: string[] }).tags,
  })
}
console.log(`loaded ${skills.length} skills\n`)

// 2. One batch embed for all 30 taxonomy entries + N skills.
const taxonomyInputs = TAXONOMY.map(t => `${t.label}\n${t.description}`)
const skillInputs = skills.map(skillInputText)
console.log(`embedding ${taxonomyInputs.length + skillInputs.length} strings in 2 batched calls...`)

const [tagVectors, skillVectors] = await Promise.all([
  voyageEmbed(taxonomyInputs),
  voyageEmbed(skillInputs),
])

const centroids = TAXONOMY.map((t, i) => ({ slug: t.slug, vec: tagVectors[i]! }))

console.log()

// 3. Score each skill
let hits = 0
let totalClaudeTags = 0
for (let i = 0; i < skills.length; i++) {
  const s = skills[i]!
  const v = skillVectors[i]!
  const scored = centroids
    .map(c => ({ slug: c.slug, score: cosine(v, c.vec) }))
    .sort((a, b) => b.score - a.score)

  const top5 = scored.slice(0, 5)
  const top = top5[0]!.score
  const picks = scored
    .filter(x => x.score >= Math.max(FLOOR, top - MARGIN))
    .slice(0, 3)
    .map(x => x.slug)

  const hit = s.claudeTags.filter(t => top5.some(x => x.slug === t)).length
  hits += hit
  totalClaudeTags += s.claudeTags.length

  console.log(`${s.owner}/${s.name}`)
  console.log(`  voyage top-5:  ${top5.map(x => `${x.slug}:${x.score.toFixed(3)}`).join('  ')}`)
  console.log(`  claude tags:   ${s.claudeTags.join(', ')}  (${hit}/${s.claudeTags.length} in embed top-5)`)
  console.log(`  embed picks:   ${picks.length ? picks.join(', ') : '(below floor)'}`)
  console.log()
}

console.log(`overall claude-tag recall in embed top-5: ${hits}/${totalClaudeTags} = ${Math.round(100 * hits / totalClaudeTags)}%`)
