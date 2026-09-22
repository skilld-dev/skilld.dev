/// <reference types="@cloudflare/workers-types" />

export interface FixedWindowRequest {
  bucket: string
  limit: number
  windowSeconds: number
  now: number
}

export type FixedWindowDecision
  = | { _tag: 'allowed', hits: number }
    | { _tag: 'limited', hits: number }

/**
 * Start of the window `now` falls in.
 *
 * Pure so a caller can reason about the window without a database.
 */
export function fixedWindowStart(now: number, windowSeconds: number): number {
  return Math.floor(now / windowSeconds) * windowSeconds
}

/** Pure verdict for a window that has already recorded `hits` calls. */
export function decideFixedWindow(hits: number, limit: number): FixedWindowDecision {
  return hits <= limit ? { _tag: 'allowed', hits } : { _tag: 'limited', hits }
}

/**
 * Count one call against `bucket` and say whether it is inside the limit.
 *
 * The count and the verdict come from one statement, so two concurrent
 * requests cannot both read the same pre-increment value. A KV counter cannot
 * promise that, and this limiter is the only bound on GitHub calls made from a
 * read path.
 */
export async function consumeFixedWindow(
  db: D1Database,
  request: FixedWindowRequest,
): Promise<FixedWindowDecision> {
  const windowStart = fixedWindowStart(request.now, request.windowSeconds)
  const row = await db.prepare(
    `INSERT INTO auto_index_rate_limits (bucket, window_start, hits)
     VALUES (?, ?, 1)
     ON CONFLICT(bucket) DO UPDATE SET
       window_start = MAX(auto_index_rate_limits.window_start, excluded.window_start),
       hits = CASE
         WHEN auto_index_rate_limits.window_start < excluded.window_start THEN 1
         ELSE auto_index_rate_limits.hits + 1
       END
     RETURNING hits`,
  ).bind(request.bucket, windowStart).first<{ hits: number }>()

  if (!row)
    throw new Error(`rate limit bucket ${request.bucket} returned no row`)
  return decideFixedWindow(row.hits, request.limit)
}

/**
 * Delete buckets whose recorded window ended more than one window ago.
 *
 * Every unique caller inserts one row, so without this the table grows by one
 * permanent row per visitor IP that ever touched the limited path. A deleted
 * bucket loses nothing: the next {@link consumeFixedWindow} call inserts a
 * fresh row starting at one hit, which is exactly what the window reset in the
 * upsert would have produced.
 */
export async function deleteExpiredFixedWindowBuckets(
  db: D1Database,
  request: { windowSeconds: number, now: number },
): Promise<number> {
  const result = await db.prepare(
    `DELETE FROM auto_index_rate_limits WHERE window_start < ?`,
  ).bind(request.now - request.windowSeconds).run()
  return result.meta.changes
}
