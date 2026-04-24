/**
 * Prototype: build the curator co-occurrence index and dump the neighbors
 * for a given skill (or the full map for inspection).
 *
 * Usage:
 *   pnpm tsx scripts/prototype-cooccurrence.ts --skill skill-creator
 *   pnpm tsx scripts/prototype-cooccurrence.ts --dump
 *
 * This talks directly to AT Protocol PDSes to fetch curator collection lists,
 * and to wrangler for the curator DID list. No D1 writes — the index is
 * KV-cached in prod, here we just rebuild and print.
 */

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { listCollectionRecords } from '../server/utils/atproto/collections'

const { values } = parseArgs({
  options: {
    skill: { type: 'string' },
    dump: { type: 'boolean' },
    top: { type: 'string', default: '10' },
    remote: { type: 'boolean' },
  },
})

const REMOTE_FLAG = values.remote ? '--remote' : '--local'
const TOP = Math.max(1, Number(values.top) || 10)

function d1Query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error(res.stderr)
    throw new Error(`wrangler d1 exec failed (${res.status})`)
  }
  return (JSON.parse(res.stdout)[0]?.results ?? []) as T[]
}

interface CuratorRow { did: string, handle: string }

async function run() {
  const curators = d1Query<CuratorRow>('SELECT did, handle FROM curators')
  console.log(`fetched ${curators.length} curators`)

  const skillCurators = new Map<string, Set<string>>()
  await Promise.all(curators.map(async (c) => {
    const records = await listCollectionRecords(c.did).catch((err) => {
      console.warn(`[${c.handle}] fetch failed:`, err instanceof Error ? err.message : err)
      return []
    })
    for (const { record } of records) {
      for (const skill of record.skills) {
        const set = skillCurators.get(skill.packageName) ?? new Set()
        set.add(c.did)
        skillCurators.set(skill.packageName, set)
      }
    }
  }))

  console.log(`skills with ≥1 curator: ${skillCurators.size}`)

  const names = [...skillCurators.keys()]
  const neighbors: Record<string, { name: string, score: number, shared: number }[]> = {}
  for (const a of names) {
    const aSet = skillCurators.get(a)!
    if (aSet.size < 2)
      continue
    const cands: { name: string, score: number, shared: number }[] = []
    for (const b of names) {
      if (a === b)
        continue
      const bSet = skillCurators.get(b)!
      if (bSet.size < 2)
        continue
      let shared = 0
      for (const d of aSet) {
        if (bSet.has(d))
          shared++
      }
      if (shared < 2)
        continue
      const union = aSet.size + bSet.size - shared
      cands.push({ name: b, score: shared / union, shared })
    }
    cands.sort((x, y) => y.score - x.score)
    if (cands.length)
      neighbors[a] = cands.slice(0, TOP)
  }

  if (values.skill) {
    const n = neighbors[values.skill]
    if (!n?.length) {
      console.log(`\nno neighbors for ${values.skill} (skill may not be in any collection, or only 1 curator)`)
      return
    }
    console.log(`\nneighbors for ${values.skill}:`)
    for (const x of n) console.log(`  ${x.score.toFixed(3)}  shared=${x.shared}  ${x.name}`)
    return
  }

  if (values.dump) {
    const entries = Object.entries(neighbors).slice(0, 20)
    console.log(`\ntop 20 skills with neighbors (${Object.keys(neighbors).length} total):`)
    for (const [name, n] of entries) {
      console.log(`\n${name}:`)
      for (const x of n.slice(0, 3)) console.log(`  ${x.score.toFixed(3)}  ${x.name}`)
    }
    return
  }

  console.log(`\ncoverage: ${Object.keys(neighbors).length} / ${skillCurators.size} skills have ≥1 neighbor`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
