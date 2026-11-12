/// <reference types="@cloudflare/workers-types" />

/**
 * How long a settled public Resolution is kept.
 *
 * The CLI reads a Resolution only while its build runs, and gives up after 60
 * seconds. A run check settles on the next sweep run, 15 minutes later. Three
 * days leaves the daily check-in its own window and a day to spare.
 */
export const RESOLUTION_RETENTION_SECONDS = 3 * 24 * 60 * 60

/**
 * Resolutions one prune may delete. Each carries about 60 KB of attestations,
 * so one batch frees about 30 MB and keeps each D1 statement small.
 */
export const RESOLUTION_PRUNE_BATCH = 500

/**
 * Settled public Resolutions nothing needs any more.
 *
 * A Resolution stays while:
 * - it is private, because private Artifacts and their grants hang off it;
 * - it is newer than the retention window;
 * - a run check still reads it;
 * - a download grant names it;
 * - it is ready and holds the newest attestation of its Artifact, which build
 *   reuse reads and the Artifact routes serve;
 * - a reused build names it, because that build serves its attestation.
 *
 * A reused build holds no attestation of its own, so it goes once the window
 * passes. Deleting one cascades to its attestation, check results, and
 * requester rows. Migration 0161 indexes the reused-build lookup.
 * The batch prune filters by `idx_artifact_resolutions_state`, so its scan reads
 * only settled rows older than the window.
 */
const UNNEEDED = `
  r.state IN ('ready', 'blocked', 'failed', 'revoked')
    AND r.visibility = 'public'
    AND r.id NOT IN (
      SELECT pending_resolution_id FROM artifact_run_checks WHERE pending_resolution_id IS NOT NULL
      UNION
      SELECT settled_resolution_id FROM artifact_run_checks WHERE settled_resolution_id IS NOT NULL
      UNION
      SELECT resolution_id FROM artifact_download_grants
    )
    AND NOT EXISTS (
      SELECT 1 FROM artifact_resolutions reused
      WHERE reused.attestation_resolution_id = r.id
    )
    AND (
      r.state <> 'ready'
      OR r.attestation_resolution_id IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM artifact_attestations own
        JOIN artifact_attestations newer
          ON newer.artifact_id = own.artifact_id
         AND (newer.created_at, newer.resolution_id) > (own.created_at, own.resolution_id)
        WHERE own.resolution_id = r.id
      )
    )
`

const PRUNE_CANDIDATES = `
  SELECT r.id
  FROM artifact_resolutions r INDEXED BY idx_artifact_resolutions_state
  WHERE r.updated_at < ?1
    AND ${UNNEEDED}
  LIMIT ?2
`

/**
 * Delete one batch of settled public Resolutions nothing needs.
 *
 * Returns how many it deleted. A full batch means more remain.
 */
export async function pruneSettledResolutions(
  db: D1Database,
  input: { now: number, retentionSeconds?: number, limit?: number },
): Promise<number> {
  const cutoff = input.now - (input.retentionSeconds ?? RESOLUTION_RETENTION_SECONDS)
  const result = await db.prepare(
    `DELETE FROM artifact_resolutions WHERE id IN (${PRUNE_CANDIDATES})`,
  ).bind(cutoff, input.limit ?? RESOLUTION_PRUNE_BATCH).run()
  return result.meta.changes ?? 0
}

/**
 * Delete one Resolution now, when nothing needs it, without waiting for the
 * retention window. The run sweep calls this for the check a newer check
 * replaced. Returns whether it deleted the row.
 */
export async function deleteUnneededResolution(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare(
    `DELETE FROM artifact_resolutions WHERE id IN (
       SELECT r.id FROM artifact_resolutions r WHERE r.id = ?1 AND ${UNNEEDED}
     )`,
  ).bind(id).run()
  return (result.meta.changes ?? 0) > 0
}

/** Batches one drain may run. Eight batches clear a 100k backlog in about 6 hours of sweeps. */
export const RESOLUTION_DRAIN_BATCHES = 8

/** Time one drain may spend before it leaves the rest to the next run. */
export const RESOLUTION_DRAIN_BUDGET_MS = 20_000

/**
 * Prune batches until one comes back short, the batch cap is hit, or the time
 * budget runs out. Steady state stops after one short batch. Returns how many
 * Resolutions it deleted.
 */
export async function drainSettledResolutions(
  db: D1Database,
  input: { now: number, clockMs: () => number, limit?: number, maxBatches?: number, budgetMs?: number },
): Promise<number> {
  const limit = input.limit ?? RESOLUTION_PRUNE_BATCH
  const maxBatches = input.maxBatches ?? RESOLUTION_DRAIN_BATCHES
  const deadline = input.clockMs() + (input.budgetMs ?? RESOLUTION_DRAIN_BUDGET_MS)
  let deleted = 0
  for (let batch = 0; batch < maxBatches && input.clockMs() < deadline; batch++) {
    const count = await pruneSettledResolutions(db, { now: input.now, limit })
    deleted += count
    if (count < limit)
      break
  }
  return deleted
}
