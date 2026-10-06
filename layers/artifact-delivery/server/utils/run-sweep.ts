import type { SourceRequest } from '../schemas/contracts'
import type { ResolutionAccess } from './request-resolution'
import type { CreateResolutionResult, ResolutionRow } from './state'
import { z } from 'zod'
import { ACTIVE_BUILD_STATES, getResolution, parseCheckResults } from './state'

/** One Skill whose page shows `skilld run OWNER/REPOSITORY/NAME`. */
export interface RunnableSkill {
  owner: string
  repository: string
  name: string
}

export interface SkillRunFailure extends RunnableSkill {
  /** What the CLI prints first: a problem code, or `CHECK_BLOCKED:<check>`. */
  tag: string
  detail: string | null
}

export interface SkillRunSweepDependencies {
  db: D1Database
  /** The Skills the registry shows a run command for. */
  listRunnableSkills: () => Promise<RunnableSkill[]>
  /** The request `POST /api/v1/resolutions` makes, with no HTTP around it. */
  requestResolution: (input: {
    source: SourceRequest
    idempotencyKey: string
    access: ResolutionAccess
  }) => Promise<CreateResolutionResult>
  newIdempotencyKey: () => string
  now: () => number
  /** How many new checks one run starts. */
  batchSize: number
}

export interface SkillRunSweepReport {
  started: number
  settled: number
  /** Skills that failed for a reason a retry cannot change, and did not before. */
  newFailures: SkillRunFailure[]
  /** Failures a later run can clear, such as a spent GitHub quota. Recorded, never alarmed. */
  transientFailures: SkillRunFailure[]
  recovered: RunnableSkill[]
  /** Runnable Skills whose last check failed for a reason a retry cannot change. */
  failing: number
}

/**
 * A check that stays pending this long counts as failed. The CLI gives up after
 * 60 seconds, so a person would have seen a timeout long before.
 */
const PENDING_TIMEOUT_SECONDS = 30 * 60

const checkRowSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  name: z.string(),
  outcome: z.enum(['ready', 'failing']).nullable(),
  tag: z.string().nullable(),
  retryable: z.union([z.literal(0), z.literal(1)]),
  failing_since: z.number().int().nullable(),
  settled_at: z.number().int().nullable(),
  pending_resolution_id: z.string().nullable(),
  requested_at: z.number().int().nullable(),
})

type CheckRow = z.infer<typeof checkRowSchema>

type Settled
  = | { _tag: 'pending' }
    | { _tag: 'ready' }
    | { _tag: 'failing', tag: string, detail: string | null, retryable: boolean }

/**
 * One run of the skilld run sweep.
 *
 * It settles the checks the last run started, then starts new ones for the
 * Skills checked longest ago. Each check is the Resolution request the CLI
 * sends for `skilld run OWNER/REPOSITORY/NAME`: a named Skill, no reference,
 * and the same build queue. A build takes longer than one Worker invocation
 * allows to wait, so a check settles on the next run.
 *
 * A new failure is one a retry cannot change, on a Skill whose last check did
 * not fail with the same tag. The caller alarms on those.
 */
export async function runSkillRunSweep(dependencies: SkillRunSweepDependencies): Promise<SkillRunSweepReport> {
  const report: SkillRunSweepReport = {
    started: 0,
    settled: 0,
    newFailures: [],
    transientFailures: [],
    recovered: [],
    failing: 0,
  }
  const rows = await loadCheckRows(dependencies.db)
  const now = dependencies.now()

  for (const row of rows.values()) {
    if (!row.pending_resolution_id)
      continue
    const resolution = await getResolution(dependencies.db, row.pending_resolution_id)
    const settled = settleResolution(resolution, now - (row.requested_at ?? now))
    if (settled._tag === 'pending')
      continue
    report.settled++
    const skill = { owner: row.owner, repository: row.repository, name: row.name }
    if (settled._tag === 'ready') {
      if (row.outcome === 'failing' && row.retryable === 0)
        report.recovered.push(skill)
      await writeSettled(dependencies.db, row, { outcome: 'ready', tag: null, detail: null, retryable: false, failingSince: null }, now)
      rows.set(skillKey(skill), { ...row, outcome: 'ready', tag: null, retryable: 0, pending_resolution_id: null, settled_at: now })
      continue
    }
    const failure = { ...skill, tag: settled.tag, detail: settled.detail }
    const sameFailure = row.outcome === 'failing' && row.tag === settled.tag
    if (settled.retryable)
      report.transientFailures.push(failure)
    else if (!sameFailure)
      report.newFailures.push(failure)
    const failingSince = sameFailure ? row.failing_since ?? now : now
    await writeSettled(dependencies.db, row, {
      outcome: 'failing',
      tag: settled.tag,
      detail: settled.detail,
      retryable: settled.retryable,
      failingSince,
    }, now)
    rows.set(skillKey(skill), {
      ...row,
      outcome: 'failing',
      tag: settled.tag,
      retryable: settled.retryable ? 1 : 0,
      failing_since: failingSince,
      pending_resolution_id: null,
      settled_at: now,
    })
  }

  const runnable = await dependencies.listRunnableSkills()
  report.failing = runnable.filter((skill) => {
    const row = rows.get(skillKey(skill))
    return row?.outcome === 'failing' && row.retryable === 0
  }).length

  const due = runnable
    .filter(skill => !rows.get(skillKey(skill))?.pending_resolution_id)
    .sort((left, right) =>
      (rows.get(skillKey(left))?.settled_at ?? 0) - (rows.get(skillKey(right))?.settled_at ?? 0)
      || compareText(skillKey(left), skillKey(right)))
    .slice(0, Math.max(0, dependencies.batchSize))
  for (const skill of due) {
    const result = await dependencies.requestResolution({
      source: {
        provider: 'github',
        owner: skill.owner,
        repository: skill.repository,
        selector: { type: 'named-skill', name: skill.name },
      },
      idempotencyKey: dependencies.newIdempotencyKey(),
      access: { visibility: 'public' },
    })
    if (result._tag === 'idempotency-conflict')
      throw new Error('A fresh sweep Idempotency-Key named another request')
    await writePending(dependencies.db, skill, result.row.id, now)
    report.started++
  }
  return report
}

/**
 * The outcome `skilld run` would print for one Resolution.
 *
 * A blocked Resolution names its first failing required check, like the CLI.
 */
export function settleResolution(resolution: ResolutionRow | null, pendingSeconds: number): Settled {
  if (!resolution)
    return { _tag: 'failing', tag: 'RESOLUTION_MISSING', detail: null, retryable: true }
  if ((ACTIVE_BUILD_STATES as readonly string[]).includes(resolution.state)) {
    return pendingSeconds >= PENDING_TIMEOUT_SECONDS
      ? { _tag: 'failing', tag: 'RESOLUTION_TIMEOUT', detail: `Pending at ${resolution.state}.`, retryable: true }
      : { _tag: 'pending' }
  }
  if (resolution.state === 'ready')
    return { _tag: 'ready' }
  if (resolution.state === 'blocked') {
    const failed = parseCheckResults(resolution.check_results_json)
      .find(check => check.required && (check.outcome === 'fail' || check.outcome === 'error'))
    return {
      _tag: 'failing',
      tag: `CHECK_BLOCKED:${failed?.name ?? 'unknown'}`,
      detail: [failed?.summary, failed?.findings?.[0]].filter(Boolean).join(' ').slice(0, 500) || null,
      retryable: false,
    }
  }
  if (resolution.state === 'revoked')
    return { _tag: 'failing', tag: 'ARTIFACT_REVOKED', detail: null, retryable: false }
  return {
    _tag: 'failing',
    tag: resolution.error_code ?? 'SERVICE_UNAVAILABLE',
    detail: null,
    retryable: resolution.error_retryable === 1,
  }
}

async function loadCheckRows(db: D1Database): Promise<Map<string, CheckRow>> {
  const result = await db.prepare(
    `SELECT owner, repository, name, outcome, tag, retryable, failing_since,
            settled_at, pending_resolution_id, requested_at
     FROM artifact_run_checks`,
  ).all<Record<string, unknown>>()
  const rows = new Map<string, CheckRow>()
  for (const value of result.results ?? []) {
    const row = checkRowSchema.parse(value)
    rows.set(skillKey(row), row)
  }
  return rows
}

async function writeSettled(
  db: D1Database,
  row: CheckRow,
  settled: { outcome: 'ready' | 'failing', tag: string | null, detail: string | null, retryable: boolean, failingSince: number | null },
  now: number,
): Promise<void> {
  await db.prepare(
    `UPDATE artifact_run_checks
     SET outcome = ?4, tag = ?5, detail = ?6, retryable = ?7, failing_since = ?8,
         settled_at = ?9, settled_resolution_id = pending_resolution_id,
         pending_resolution_id = NULL
     WHERE owner = ?1 AND repository = ?2 AND name = ?3`,
  ).bind(
    row.owner,
    row.repository,
    row.name,
    settled.outcome,
    settled.tag,
    settled.detail,
    settled.retryable ? 1 : 0,
    settled.failingSince,
    now,
  ).run()
}

async function writePending(db: D1Database, skill: RunnableSkill, resolutionId: string, now: number): Promise<void> {
  await db.prepare(
    `INSERT INTO artifact_run_checks (owner, repository, name, pending_resolution_id, requested_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (owner, repository, name) DO UPDATE SET
       pending_resolution_id = excluded.pending_resolution_id,
       requested_at = excluded.requested_at`,
  ).bind(skill.owner, skill.repository, skill.name, resolutionId, now).run()
}

function skillKey(skill: RunnableSkill): string {
  return `${skill.owner}/${skill.repository}/${skill.name}`
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
