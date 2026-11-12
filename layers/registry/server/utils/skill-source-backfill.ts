/// <reference types="@cloudflare/workers-types" />

import type { SkillSourceBucket } from './skill-source-store'
import { putSkillSource } from './skill-source-store'

export const SKILL_SOURCE_BACKFILL_CURSOR = 'skill-sources-r2-v1'

/**
 * Rows one run copies. Each is one R2 put, and a put that already exists is
 * one conditional request. 200 keeps a run under the subrequest budget with
 * room for its D1 reads, and copies the 25,145 rows of 2026-11-12 in about
 * ten hours of five-minute runs.
 */
export const SKILL_SOURCE_BACKFILL_BATCH = 200

interface SourceRow {
  rowid: number
  rendered_raw: string
  rendered_raw_sha256: string
}

export interface SkillSourceBackfillReport {
  /** Rows read past the cursor this run. Zero means the walk is complete. */
  scanned: number
  stored: number
  existing: number
  failed: number
  /** The rowid the next run starts after. */
  position: number
}

/**
 * Copy the next batch of stored SKILL.md bodies to R2, by rowid.
 *
 * The cursor only advances past rows whose put succeeded or found the object
 * already there. A failed put holds the cursor at the row before it, so the
 * next run retries from that row instead of leaving a hole the readers would
 * fall back to D1 for forever.
 *
 * A row the sync rewrites after this walk passes it is covered by the sync's
 * own dual write, so one pass is enough.
 */
export async function backfillSkillSources(
  db: D1Database,
  bucket: SkillSourceBucket,
  input: { now: number, limit?: number },
): Promise<SkillSourceBackfillReport> {
  const limit = input.limit ?? SKILL_SOURCE_BACKFILL_BATCH
  const cursor = await db.prepare(`SELECT position FROM registry_cursors WHERE name = ?`)
    .bind(SKILL_SOURCE_BACKFILL_CURSOR)
    .first<{ position: number }>()
  const start = cursor?.position ?? 0

  const rows = await db.prepare(
    `SELECT rowid, rendered_raw, rendered_raw_sha256
     FROM skills
     WHERE rowid > ?
       AND rendered_raw IS NOT NULL
       AND rendered_raw_sha256 IS NOT NULL
     ORDER BY rowid
     LIMIT ?`,
  ).bind(start, limit).all<SourceRow>()

  const report: SkillSourceBackfillReport = { scanned: 0, stored: 0, existing: 0, failed: 0, position: start }
  for (const row of rows.results ?? []) {
    report.scanned += 1
    const result = await putSkillSource(bucket, { body: row.rendered_raw, contentSha256: row.rendered_raw_sha256 })
    if (result._tag === 'failed') {
      report.failed += 1
      console.warn(`[backfill-skill-sources] put failed at rowid ${row.rowid}: ${result.reason}`)
      break
    }
    if (result._tag === 'stored')
      report.stored += 1
    else
      report.existing += 1
    report.position = row.rowid
  }

  if (report.position !== start) {
    await db.prepare(
      `INSERT INTO registry_cursors (name, position, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at`,
    ).bind(SKILL_SOURCE_BACKFILL_CURSOR, report.position, input.now).run()
  }
  return report
}
