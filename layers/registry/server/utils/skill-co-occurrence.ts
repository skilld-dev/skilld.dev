/// <reference types="@cloudflare/workers-types" />
// Phase 1: co-occurrence was sourced from atproto curator collections, which
// are gone. Returns empty until Phase 2 rebuilds it on collections_v2.
export interface CoOccurrenceNeighbor {
  name: string
  score: number
  sharedCurators: number
}

interface CoOccurrenceIndex {
  builtAt: string
  neighbors: Record<string, CoOccurrenceNeighbor[]>
}

export async function buildCoOccurrenceIndex(_db: D1Database, _topN = 10): Promise<CoOccurrenceIndex> {
  return { builtAt: new Date().toISOString(), neighbors: {} }
}

export async function getCoOccurrenceNeighbors(_db: D1Database, _skillName: string): Promise<CoOccurrenceNeighbor[]> {
  return []
}

export async function refreshCoOccurrenceIndex(_db: D1Database): Promise<CoOccurrenceIndex> {
  return { builtAt: new Date().toISOString(), neighbors: {} }
}
