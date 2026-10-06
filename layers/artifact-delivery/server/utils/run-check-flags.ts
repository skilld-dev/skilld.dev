import type { RunnableSkill } from './run-sweep'
import { z } from 'zod'
import { FLAG_AFTER_FAILURES, runCheckFlag, runCheckStateOf } from './run-check-state'

/** One flagged Skill: its run checks failed in a row for a reason a retry cannot change. */
export interface RunCheckFlagRow extends RunnableSkill {
  tag: string
  detail: string | null
  /** Unix seconds the last failing check settled. */
  failedAt: number
}

const flagRowSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  name: z.string(),
  outcome: z.enum(['ready', 'failing']).nullable(),
  tag: z.string().nullable(),
  detail: z.string().nullable(),
  retryable: z.union([z.literal(0), z.literal(1)]),
  failing_since: z.number().int().nullable(),
  failure_streak: z.number().int().nonnegative(),
  failed_at: z.number().int().nullable(),
  settled_at: z.number().int().nullable(),
})

/**
 * Every flagged Skill, or the one named, matched without regard to case.
 *
 * The streak index limits the read to rows that can flag, so a call reads the
 * flagged rows and no others. `runCheckFlag` stays the one rule.
 */
export async function loadRunCheckFlags(db: D1Database, skill: RunnableSkill | null): Promise<RunCheckFlagRow[]> {
  const result = await db.prepare(
    `SELECT owner, repository, name, outcome, tag, detail, retryable, failing_since,
            failure_streak, failed_at, settled_at
     FROM artifact_run_checks
     WHERE failure_streak >= ?1
       AND (?2 IS NULL OR (owner = ?2 COLLATE NOCASE AND repository = ?3 COLLATE NOCASE AND name = ?4 COLLATE NOCASE))
     ORDER BY owner, repository, name`,
  ).bind(FLAG_AFTER_FAILURES, skill?.owner ?? null, skill?.repository ?? null, skill?.name ?? null).all<Record<string, unknown>>()
  const flags: RunCheckFlagRow[] = []
  for (const value of result.results ?? []) {
    const row = flagRowSchema.parse(value)
    const flag = runCheckFlag(runCheckStateOf(row))
    if (flag._tag === 'flagged')
      flags.push({ owner: row.owner, repository: row.repository, name: row.name, tag: flag.tag, detail: flag.detail, failedAt: flag.failedAt })
  }
  return flags
}
