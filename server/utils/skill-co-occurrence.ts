/// <reference types="@cloudflare/workers-types" />
/**
 * "Curators who added X also added Y". Built by walking the endorsement map
 * that already exists on a 5-min TTL, so this piggybacks on that cache.
 *
 * Storage: top-N neighbors per skill as a single KV blob keyed by a short
 * version tag. Single read at page render time. Full rebuild each refresh —
 * the matrix is sparse enough that O(skills × collections) is fine.
 */
import { listCollectionRecords } from './atproto/collections'
import { getAllCurators } from './atproto/curator-index'

export interface CoOccurrenceNeighbor {
  name: string
  score: number
  sharedCurators: number
}

const CACHE_KEY = 'skills:co-occurrence:v1'
const CACHE_TTL = 60 * 60 // 1h — cheap to rebuild, but no reason to thrash

interface CoOccurrenceIndex {
  builtAt: string
  neighbors: Record<string, CoOccurrenceNeighbor[]>
}

/**
 * Walk curator collections, produce a `skill -> Set<curatorDid>` map, then
 * compute Jaccard distance between every pair that shares ≥2 curators.
 * Normalizing by union controls for popular-skill dominance.
 */
export async function buildCoOccurrenceIndex(db: D1Database, topN = 10): Promise<CoOccurrenceIndex> {
  const curators = await getAllCurators(db)
  const skillCurators = new Map<string, Set<string>>()

  const settled = await Promise.allSettled(curators.map(async (curator) => {
    const records = await listCollectionRecords(curator.did)
    for (const { record } of records) {
      for (const skill of record.skills) {
        const set = skillCurators.get(skill.packageName) ?? new Set<string>()
        set.add(curator.did)
        skillCurators.set(skill.packageName, set)
      }
    }
  }))

  for (const s of settled) {
    if (s.status === 'rejected')
      console.warn('[co-occurrence] curator fetch failed:', s.reason)
  }

  const names = [...skillCurators.keys()]
  const neighbors: Record<string, CoOccurrenceNeighbor[]> = {}

  for (const a of names) {
    const aSet = skillCurators.get(a)!
    if (aSet.size < 2)
      continue
    const candidates: CoOccurrenceNeighbor[] = []

    for (const b of names) {
      if (a === b)
        continue
      const bSet = skillCurators.get(b)!
      if (bSet.size < 2)
        continue

      let shared = 0
      const smaller = aSet.size <= bSet.size ? aSet : bSet
      const larger = smaller === aSet ? bSet : aSet
      for (const did of smaller) {
        if (larger.has(did))
          shared++
      }
      if (shared < 2)
        continue

      const unionSize = aSet.size + bSet.size - shared
      const jaccard = shared / unionSize
      candidates.push({ name: b, score: jaccard, sharedCurators: shared })
    }

    candidates.sort((x, y) => y.score - x.score || y.sharedCurators - x.sharedCurators)
    if (candidates.length)
      neighbors[a] = candidates.slice(0, topN)
  }

  return { builtAt: new Date().toISOString(), neighbors }
}

export async function getCoOccurrenceNeighbors(db: D1Database, skillName: string): Promise<CoOccurrenceNeighbor[]> {
  let index = await useStorage('cache').getItem<CoOccurrenceIndex>(CACHE_KEY)
  if (!index) {
    index = await buildCoOccurrenceIndex(db)
    await useStorage('cache').setItem(CACHE_KEY, index, { ttl: CACHE_TTL })
  }
  return index.neighbors[skillName] ?? []
}

/** Admin: force a rebuild, e.g. from a cron task or debug endpoint. */
export async function refreshCoOccurrenceIndex(db: D1Database): Promise<CoOccurrenceIndex> {
  const index = await buildCoOccurrenceIndex(db)
  await useStorage('cache').setItem(CACHE_KEY, index, { ttl: CACHE_TTL })
  return index
}
