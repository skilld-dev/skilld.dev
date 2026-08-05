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

const VECTOR_READ_CHUNK = 20

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

/**
 * Vectorize exposes enumeration through the CLI and REST API only, so a Worker
 * holding the binding cannot list the index to diff it. It does not need to.
 * `getByIds` over the eligible set decides missing and stale directly, and
 * `describe().vectorCount` closes the gap: an index holding exactly the vectors
 * the eligible set expects has nothing left over, so the surplus over what the
 * reads accounted for is the orphan count.
 *
 * The count is only meaningful once the index has settled. `describe()` reports
 * the last mutation it processed, so a mutation landing mid-audit is reported
 * as unsettled rather than alarmed on, and the next run decides.
 */
/**
 * `describe()` reports the index size under two different names across Vectorize
 * generations, and only the newer one carries a processed-mutation marker. The
 * generated worker types name the binding as the older shape while the index
 * itself is V2, so neither field is safe to assume. Both are read structurally,
 * and the marker is treated as an optional extra rather than a requirement.
 */
export interface VectorizeIndexDescription {
  vectorCount?: number
  vectorsCount?: number
  processedUpToMutation?: string | number | null
}

export interface EmbeddingParityAuditDependencies {
  db: D1Database
  vectorize: Pick<VectorizeIndex, 'getByIds'> & {
    describe: () => Promise<VectorizeIndexDescription>
  }
}

function indexVectorCount(description: VectorizeIndexDescription): number {
  const count = typeof description.vectorCount === 'number'
    ? description.vectorCount
    : description.vectorsCount
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
    throw new TypeError('Vectorize describe() returned no usable vector count')
  return count
}

export type EmbeddingParityIndexState
  = | { _tag: 'settled', vectorCount: number, orphan: number }
    | {
      _tag: 'unsettled'
      reason: 'mutation_in_flight' | 'count_below_expected'
      vectorCount: number
    }

export interface EmbeddingParityAudit {
  counts: {
    eligible: number
    present: number
    missing: number
    stale: number
  }
  ids: {
    present: string[]
    missing: string[]
    stale: string[]
  }
  index: EmbeddingParityIndexState
}

export type EmbeddingParityAuditAlarm
  = | { _tag: 'clear' }
    | { _tag: 'triggered', missing: number, stale: number, orphan: number }
    | { _tag: 'unsettled', reason: 'mutation_in_flight' | 'count_below_expected' }

export function embeddingParityAuditAlarm(audit: EmbeddingParityAudit): EmbeddingParityAuditAlarm {
  if (audit.index._tag === 'unsettled')
    return { _tag: 'unsettled', reason: audit.index.reason }
  const { missing, stale } = audit.counts
  const { orphan } = audit.index
  return missing > 0 || stale > 0 || orphan > 0
    ? { _tag: 'triggered', missing, stale, orphan }
    : { _tag: 'clear' }
}

export async function auditEmbeddingParityViaBindings(
  deps: EmbeddingParityAuditDependencies,
): Promise<EmbeddingParityAudit> {
  const before = await deps.vectorize.describe()
  const rawRows = await deps.db.prepare(ELIGIBLE_EMBEDDINGS_SQL).bind().all<RawEligibleEmbeddingRow>()
  const eligible = (rawRows.results ?? []).map(row => ({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    currentSha: row.current_sha,
    markerSha: row.marker_sha,
  }))
  const expectedIds = await Promise.all(eligible.map(row => vectorIdFor(row)))
  const vectors: EmbeddingParityVector[] = []
  for (let index = 0; index < expectedIds.length; index += VECTOR_READ_CHUNK) {
    const response = await deps.vectorize.getByIds(expectedIds.slice(index, index + VECTOR_READ_CHUNK))
    vectors.push(...parseVectors(response))
  }
  // Passing the ids the reads actually returned as the inventory keeps the
  // shared classifier exact for missing and stale, and leaves orphans to the
  // count comparison below, which is the only evidence the binding can give.
  const parity = await calculateEmbeddingParity(eligible, vectors, vectors.map(vector => vector.id))
  const after = await deps.vectorize.describe()

  // Either signal proves the index moved while it was being read. The mutation
  // marker catches a change that leaves the size the same; the count catches a
  // change on an index generation that reports no marker at all.
  const beforeCount = indexVectorCount(before)
  const afterCount = indexVectorCount(after)
  const moved = before.processedUpToMutation !== after.processedUpToMutation
    || beforeCount !== afterCount

  const accountedFor = parity.ids.present.length + parity.ids.stale.length
  const index: EmbeddingParityIndexState = moved
    ? { _tag: 'unsettled', reason: 'mutation_in_flight', vectorCount: afterCount }
    : afterCount < accountedFor
      ? { _tag: 'unsettled', reason: 'count_below_expected', vectorCount: afterCount }
      : { _tag: 'settled', vectorCount: afterCount, orphan: afterCount - accountedFor }

  return {
    counts: {
      eligible: parity.counts.eligible,
      present: parity.counts.present,
      missing: parity.counts.missing,
      stale: parity.counts.stale,
    },
    ids: {
      present: parity.ids.present,
      missing: parity.ids.missing,
      stale: parity.ids.stale,
    },
    index,
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

/**
 * Vectors leak because nothing deletes them when a skill leaves the eligible set.
 * `sync-repo.ts` keeps the row and sets `seo_indexable = 0` when a skill file
 * disappears upstream, so every upstream removal strands a vector permanently.
 * Orphans grew 53 → 98 → 678 across three nights while manual pruning cleared
 * 106, which is the shape of a leak the manual path cannot outrun.
 *
 * The audit above cannot fix this on its own: the binding has no enumeration, so
 * it derives orphans as a count and never as ids. D1 can name them. `vectorIdFor`
 * hashes owner/repo/name with no sha in it, so any skill still carrying an
 * `embedding` marker while failing the eligibility predicate is exactly one
 * strandable vector, addressable by id without reading the index at all.
 */
const PRUNE_CANDIDATE_SQL = `
  SELECT s.owner, s.repo, s.name
  FROM skills s
  LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  JOIN skill_generated marker
    ON marker.owner = s.owner
   AND marker.repo = s.repo
   AND marker.name = s.name
   AND marker.kind = 'embedding'
  WHERE NOT (
    r.broken_since IS NULL
    AND s.current_sha IS NOT NULL
    AND s.rendered_raw IS NOT NULL
    AND s.rendered_status = 'ok'
    AND s.seo_indexable = 1
  )
  ORDER BY s.owner ASC, s.repo ASC, s.name ASC
`

/**
 * A prune reads eligibility to decide what to delete, so a bug in that read is a
 * mass-deletion bug. The share guard is the backstop against that specific
 * failure, where the predicate stops matching and most of the index looks
 * strandable at once.
 *
 * It is deliberately not a backlog guard. Production on 2026-08-05 held 826
 * candidates against 5,424 eligible, a 15% share built up over months with no
 * automatic pruning, so a tight threshold would refuse every night and never
 * drain. Half the index is the line no ordinary leak reaches; the per-run cap
 * below is what bounds each individual run.
 */
export const MAX_PRUNE_SHARE = 0.5

/** Deletions attempted per run, so a single run can never empty the index. */
export const MAX_PRUNE_PER_RUN = 500

/** Vectorize rejects unbounded id lists, so deletes go out in chunks. */
const PRUNE_DELETE_CHUNK = 100

export interface PruneCandidate {
  owner: string
  repo: string
  name: string
}

export type EmbeddingPrunePlan
  = | { _tag: 'nothing_to_prune' }
    | {
      _tag: 'refused'
      reason: 'candidate_share_exceeded'
      candidates: number
      eligible: number
      share: number
    }
    | {
      _tag: 'prune'
      candidates: PruneCandidate[]
      deferred: number
    }

/**
 * Decide what a run may delete, separately from deleting it. Keeping the
 * judgement pure is what makes the guard rail testable without a live index.
 */
export function planEmbeddingPrune(
  candidates: PruneCandidate[],
  eligible: number,
): EmbeddingPrunePlan {
  if (candidates.length === 0)
    return { _tag: 'nothing_to_prune' }

  // An empty eligible set is itself the failure the guard exists for: every
  // vector in the index would look strandable.
  const share = eligible > 0 ? candidates.length / eligible : Number.POSITIVE_INFINITY
  if (share > MAX_PRUNE_SHARE) {
    return {
      _tag: 'refused',
      reason: 'candidate_share_exceeded',
      candidates: candidates.length,
      eligible,
      share,
    }
  }

  return {
    _tag: 'prune',
    candidates: candidates.slice(0, MAX_PRUNE_PER_RUN),
    deferred: Math.max(0, candidates.length - MAX_PRUNE_PER_RUN),
  }
}

export interface EmbeddingPruneDependencies {
  db: D1Database
  vectorize: Pick<VectorizeIndex, 'deleteByIds'>
}

export interface EmbeddingPruneOutcome {
  plan: EmbeddingPrunePlan['_tag']
  deleted: number
  deferred: number
  refusal?: Extract<EmbeddingPrunePlan, { _tag: 'refused' }>
}

export async function selectPruneCandidates(db: D1Database): Promise<PruneCandidate[]> {
  const rows = await db.prepare(PRUNE_CANDIDATE_SQL).bind().all<PruneCandidate>()
  return rows.results ?? []
}

export async function countEligibleEmbeddings(db: D1Database): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS eligible FROM (${ELIGIBLE_EMBEDDINGS_SQL})`,
  ).first<{ eligible: number }>()
  return Number(row?.eligible ?? 0)
}

/**
 * Delete the vectors, then their markers. That order matters: a marker outliving
 * its vector reappears as a candidate on the next run and is deleted again
 * harmlessly, while a marker deleted first would hide a vector the run failed to
 * remove and strand it beyond reach.
 */
export async function pruneOrphanEmbeddings(
  deps: EmbeddingPruneDependencies,
): Promise<EmbeddingPruneOutcome> {
  const [candidates, eligible] = await Promise.all([
    selectPruneCandidates(deps.db),
    countEligibleEmbeddings(deps.db),
  ])
  const plan = planEmbeddingPrune(candidates, eligible)

  if (plan._tag === 'nothing_to_prune')
    return { plan: plan._tag, deleted: 0, deferred: 0 }
  if (plan._tag === 'refused')
    return { plan: plan._tag, deleted: 0, deferred: candidates.length, refusal: plan }

  const ids = await Promise.all(plan.candidates.map(candidate => vectorIdFor(candidate)))
  let deleted = 0
  for (let index = 0; index < ids.length; index += PRUNE_DELETE_CHUNK) {
    const chunk = ids.slice(index, index + PRUNE_DELETE_CHUNK)
    await deps.vectorize.deleteByIds(chunk)
    deleted += chunk.length
    await deps.db.batch(plan.candidates
      .slice(index, index + PRUNE_DELETE_CHUNK)
      .map(candidate => deps.db.prepare(
        `DELETE FROM skill_generated
         WHERE owner = ? AND repo = ? AND name = ? AND kind = 'embedding'`,
      ).bind(candidate.owner, candidate.repo, candidate.name)))
  }

  return { plan: plan._tag, deleted, deferred: plan.deferred }
}
