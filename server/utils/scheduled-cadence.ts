import type { LatestScheduledRun, ObservedSchedulePolicy, ScheduledRunHistory, ScheduleHealth, SchedulePolicy } from '#shared/schedule-policy'
import { evaluateScheduleHealth } from '#shared/schedule-policy'

export const WATCHDOG_TASK_NAME = 'scheduled-cadence-watchdog'

/**
 * The health verdicts whose only fix is a fresh dispatch.
 *
 * `latest_failed` and `latest_expired` qualify only once their silence passes
 * the policy window: a live cadence would have inserted a newer row inside
 * that window, so an old terminal row proves the trigger is dead, not merely
 * that the task fails. The re-invocation records a fresh row that restarts the
 * window, so a genuinely failing task gains at most one extra dispatch per
 * window while its own cadence keeps retrying it.
 */
export type StalledCadence
  = | 'missing_run'
    | 'missing_cadence'
    | 'overdue_started'
    | 'latest_failed'
    | 'latest_expired'

export type CadenceDecision
  = | { _tag: 'reinvoke', taskName: string, stalled: StalledCadence }
    | { _tag: 'leave', taskName: string, health: ScheduleHealth }

export interface CadenceRunRow {
  slot: 'latest' | 'terminal'
  task_name: string
  status: LatestScheduledRun['status']
  started_at: number
  expires_at: number
  finished_at: number | null
  error: string | null
}

const RUN_STATUSES = new Set(['started', 'succeeded', 'failed', 'expired'] as const)

/**
 * Latest and latest-terminal history per task, from the ranked rows the
 * `SCHEDULE_HEALTH_LATEST_RUNS_SQL` query returns.
 */
export function cadenceHistories(rows: CadenceRunRow[]): Map<string, ScheduledRunHistory> {
  const latest = new Map<string, CadenceRunRow>()
  const terminal = new Map<string, CadenceRunRow>()
  for (const row of rows) {
    if (!RUN_STATUSES.has(row.status))
      continue
    const slot = row.slot === 'terminal' ? terminal : latest
    if (!slot.has(row.task_name))
      slot.set(row.task_name, row)
  }
  const asRun = (row: CadenceRunRow | undefined): LatestScheduledRun | null => row
    ? {
        status: row.status,
        startedAt: row.started_at,
        expiresAt: row.expires_at,
        finishedAt: row.finished_at,
        error: row.error,
      }
    : null
  const taskNames = new Set([...latest.keys(), ...terminal.keys()])
  return new Map([...taskNames].map(taskName => [taskName, {
    latest: asRun(latest.get(taskName)),
    latestTerminal: asRun(terminal.get(taskName)),
  }]))
}

/**
 * Whether a health verdict warrants a fresh dispatch.
 *
 * `latest_failed` and `latest_expired` re-invoke only past the silence window:
 * the terminal verdict short-circuits `evaluateScheduleHealth` forever, so
 * without this gate a dead trigger next to a failed run would never heal.
 */
function stalledFromHealth(
  policy: ObservedSchedulePolicy,
  history: ScheduledRunHistory,
  health: ScheduleHealth,
  nowSeconds: number,
): StalledCadence | null {
  switch (health._tag) {
    case 'missing_run':
    case 'missing_cadence':
    case 'overdue_started':
      return health._tag
    case 'latest_failed':
    case 'latest_expired': {
      const latest = history.latest
      if (!latest)
        return null
      const silenceSeconds = nowSeconds - latest.startedAt
      return silenceSeconds > policy.maxSilenceSeconds ? health._tag : null
    }
    default:
      return null
  }
}

/**
 * Which tasks get a fresh dispatch, pure so the watchdog shell stays a thin
 * effect around it.
 *
 * The watchdog is excluded from its own verdicts: a stalled watchdog cannot be
 * healed by re-invoking itself, and that recursion would stack runs. Its health
 * is the daily check-in's finding instead.
 */
export function assessTaskCadence(
  policies: readonly SchedulePolicy[],
  histories: Map<string, ScheduledRunHistory>,
  nowSeconds: number,
): CadenceDecision[] {
  return policies.flatMap((policy): CadenceDecision[] => {
    if (policy._tag !== 'observed' || policy.taskName === WATCHDOG_TASK_NAME)
      return []
    const history = histories.get(policy.taskName) ?? { latest: null, latestTerminal: null }
    const health = evaluateScheduleHealth(policy, history, nowSeconds)
    const stalled = stalledFromHealth(policy, history, health, nowSeconds)
    return stalled
      ? [{ _tag: 'reinvoke', taskName: policy.taskName, stalled }]
      : [{ _tag: 'leave', taskName: policy.taskName, health }]
  })
}
