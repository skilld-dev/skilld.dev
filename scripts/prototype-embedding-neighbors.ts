/**
 * Build the embedding-neighbor index from local D1 and print the top-3
 * neighbors for every embedded skill. No API calls — pure read + cosine.
 *
 * Usage: npx tsx scripts/prototype-embedding-neighbors.ts
 */

import { spawnSync } from 'node:child_process'

function d1Query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', '--local', '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error(res.stderr)
    throw new Error(`wrangler d1 exec failed (${res.status})`)
  }
  return (JSON.parse(res.stdout)[0]?.results ?? []) as T[]
}

interface Row { owner: string, name: string, payload: string }

function cosine(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

const rows = d1Query<Row>('SELECT owner, name, payload FROM skill_generated WHERE kind = \'embedding\'')
console.log(`loaded ${rows.length} embeddings\n`)

const vectors = rows.map((r) => {
  const p = JSON.parse(r.payload) as { vector: number[] }
  return { owner: r.owner, name: r.name, vec: p.vector }
})

for (const a of vectors) {
  const sims = vectors
    .filter(b => b !== a)
    .map(b => ({ name: `${b.owner}/${b.name}`, sim: cosine(a.vec, b.vec) }))
    .sort((x, y) => y.sim - x.sim)
    .slice(0, 3)
  console.log(`${a.owner}/${a.name}`)
  for (const s of sims) console.log(`  ${s.sim.toFixed(3)}  ${s.name}`)
  console.log()
}
