/// <reference types="@cloudflare/workers-types" />

import { vectorIdFor } from './vector-id'

export const ELIGIBLE_EMBEDDINGS_SQL = `
  SELECT
    s.owner,
    s.repo,
    s.name,
    s.current_sha,
    marker.sha AS marker_sha
  FROM skills s
  JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  LEFT JOIN skill_generated marker
    ON marker.owner = s.owner
   AND marker.repo = s.repo
   AND marker.name = s.name
   AND marker.kind = 'embedding'
  WHERE r.broken_since IS NULL
    AND s.current_sha IS NOT NULL
    AND s.rendered_raw IS NOT NULL
    AND s.rendered_status = 'ok'
    AND s.seo_indexable = 1
`

export interface EligibleEmbeddingRow {
  owner: string
  repo: string
  name: string
  currentSha: string
  markerSha: string | null
}

interface RawEligibleEmbeddingRow {
  owner: string
  repo: string
  name: string
  current_sha: string
  marker_sha: string | null
}

export interface EmbeddingParityVector {
  id: string
  metadata?: Record<string, unknown>
}

export interface EmbeddingParityResult {
  counts: {
    eligible: number
    present: number
    missing: number
    stale: number
    orphan: number
  }
  ids: {
    present: string[]
    missing: string[]
    stale: string[]
    orphan: string[]
  }
}

export interface EmbeddingParityDependencies {
  db: D1Database
  vectorize: Pick<VectorizeIndex, 'getByIds'>
  listVectorIds: () => Promise<string[]>
}

export type EmbeddingParityMode
  = | { _tag: 'local_dry_run' }
    | { _tag: 'remote_dry_run' }
    | { _tag: 'refused', reason: 'remote_requires_dry_run' }

export type EmbeddingParityDryRunMode = Exclude<EmbeddingParityMode, { _tag: 'refused' }>

const VECTOR_READ_CHUNK = 100

export function parseEmbeddingParityMode(args: string[]): EmbeddingParityMode {
  const remote = args.includes('--remote')
  const dryRun = args.includes('--dry-run')
  if (remote && !dryRun)
    return { _tag: 'refused', reason: 'remote_requires_dry_run' }
  return remote ? { _tag: 'remote_dry_run' } : { _tag: 'local_dry_run' }
}

function vectorSha(vector: EmbeddingParityVector): string | null {
  const sha = vector.metadata?.sha
  return typeof sha === 'string' ? sha : null
}

export async function calculateEmbeddingParity(
  eligible: EligibleEmbeddingRow[],
  vectors: EmbeddingParityVector[],
  inventoryIds: string[],
): Promise<EmbeddingParityResult> {
  const expected = new Map<string, EligibleEmbeddingRow>()
  for (const row of eligible)
    expected.set(await vectorIdFor(row), row)

  const inventory = new Set(inventoryIds)
  const byId = new Map(vectors.map(vector => [vector.id, vector]))
  const ids: EmbeddingParityResult['ids'] = {
    present: [],
    missing: [],
    stale: [],
    orphan: [],
  }

  for (const [id, row] of expected) {
    const vector = inventory.has(id) ? byId.get(id) : undefined
    if (!vector) {
      ids.missing.push(id)
      continue
    }
    const actualSha = vectorSha(vector)
    const markerMissing = row.markerSha === null
    const markerDisagrees = row.markerSha !== null && row.markerSha !== actualSha
    if (actualSha !== row.currentSha || markerMissing || markerDisagrees)
      ids.stale.push(id)
    else
      ids.present.push(id)
  }

  for (const id of inventory) {
    if (!expected.has(id))
      ids.orphan.push(id)
  }

  for (const values of Object.values(ids))
    values.sort()

  return {
    counts: {
      eligible: eligible.length,
      present: ids.present.length,
      missing: ids.missing.length,
      stale: ids.stale.length,
      orphan: ids.orphan.length,
    },
    ids,
  }
}

function parseVectors(value: unknown): EmbeddingParityVector[] {
  if (!Array.isArray(value))
    throw new Error('Vectorize getByIds returned a non-array response')
  return value.map((candidate) => {
    if (typeof candidate !== 'object' || candidate === null || !('id' in candidate) || typeof candidate.id !== 'string')
      throw new Error('Vectorize getByIds returned a malformed vector')
    const metadata = 'metadata' in candidate
      && typeof candidate.metadata === 'object'
      && candidate.metadata !== null
      ? candidate.metadata as Record<string, unknown>
      : undefined
    return { id: candidate.id, metadata }
  })
}

export async function runEmbeddingParityCheck(
  mode: EmbeddingParityDryRunMode,
  deps: EmbeddingParityDependencies,
): Promise<EmbeddingParityResult> {
  if (mode._tag !== 'local_dry_run' && mode._tag !== 'remote_dry_run')
    throw new Error('Embedding parity execution requires an explicit dry-run mode')
  const rawRows = await deps.db.prepare(ELIGIBLE_EMBEDDINGS_SQL).bind().all<RawEligibleEmbeddingRow>()
  const eligible = (rawRows.results ?? []).map(row => ({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    currentSha: row.current_sha,
    markerSha: row.marker_sha,
  }))
  const inventoryIds = await deps.listVectorIds()
  const expectedIds = await Promise.all(eligible.map(row => vectorIdFor(row)))
  const inventory = new Set(inventoryIds)
  const presentExpectedIds = expectedIds.filter(id => inventory.has(id))
  const vectors: EmbeddingParityVector[] = []
  for (let index = 0; index < presentExpectedIds.length; index += VECTOR_READ_CHUNK) {
    const response = await deps.vectorize.getByIds(presentExpectedIds.slice(index, index + VECTOR_READ_CHUNK))
    vectors.push(...parseVectors(response))
  }
  return calculateEmbeddingParity(eligible, vectors, inventoryIds)
}
