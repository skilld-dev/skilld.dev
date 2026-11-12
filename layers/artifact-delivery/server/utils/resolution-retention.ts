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
 *   reuse copies and the Artifact routes serve.
 *
 * Deleting one cascades to its attestation, check results, and requester rows.
 * The first filters repeat `idx_artifact_resolutions_state`, so the scan reads
 * only settled rows older than the window.
 */
const PRUNE_CANDIDATES = `
  SELECT r.id
  FROM artifact_resolutions r INDEXED BY idx_artifact_resolutions_state
  WHERE r.state IN ('ready', 'blocked', 'failed', 'revoked')
    AND r.updated_at < ?1
    AND r.visibility = 'public'
    AND r.id NOT IN (
      SELECT pending_resolution_id FROM artifact_run_checks WHERE pending_resolution_id IS NOT NULL
      UNION
      SELECT settled_resolution_id FROM artifact_run_checks WHERE settled_resolution_id IS NOT NULL
      UNION
      SELECT resolution_id FROM artifact_download_grants
    )
    AND (
      r.state <> 'ready'
      OR EXISTS (
        SELECT 1
        FROM artifact_attestations own
        JOIN artifact_attestations newer
          ON newer.artifact_id = own.artifact_id
         AND (newer.created_at, newer.resolution_id) > (own.created_at, own.resolution_id)
        WHERE own.resolution_id = r.id
      )
    )
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
