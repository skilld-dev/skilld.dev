export interface ObservedSchedulePolicy {
  _tag: 'observed'
  taskName: string
  cron: string
  maxSilenceSeconds: number
  maxRuntimeSeconds: number
}

export interface ExemptSchedulePolicy {
  _tag: 'exempt'
  taskName: string
  cron: string
  reason: string
}

export type SchedulePolicy = ObservedSchedulePolicy | ExemptSchedulePolicy

export type ScheduledRunStatus = 'started' | 'succeeded' | 'failed' | 'expired'

export interface LatestScheduledRun {
  status: ScheduledRunStatus
  startedAt: number
  expiresAt: number
  finishedAt: number | null
  error: string | null
}

/**
 * Both ends of a task's recent history.
 *
 * `latest` alone cannot answer "is this task healthy": a task that fires hourly
 * and dies every time always has a run in flight, and a sampler that shares its
 * tick will only ever see that one. `latestTerminal` is the last run that
 * actually reached a verdict.
 */
export interface ScheduledRunHistory {
  latest: LatestScheduledRun | null
  latestTerminal: LatestScheduledRun | null
}

export type ScheduleHealth
  = | { _tag: 'healthy', alertable: false }
    | { _tag: 'exempt', alertable: false, reason: string }
    | { _tag: 'missing_run', alertable: true }
    | { _tag: 'missing_cadence', alertable: true, silenceSeconds: number }
    | { _tag: 'latest_failed', alertable: true, error: string }
    | { _tag: 'latest_expired', alertable: true, error: string }
    | { _tag: 'overdue_started', alertable: true, overdueSeconds: number }

export const SCHEDULE_POLICY = [
  { _tag: 'observed', taskName: 'ai-generate-poll', cron: '45 * * * *', maxSilenceSeconds: 3 * 60 * 60, maxRuntimeSeconds: 30 * 60 },
  { _tag: 'observed', taskName: 'ai-generate-submit', cron: '15 * * * *', maxSilenceSeconds: 3 * 60 * 60, maxRuntimeSeconds: 50 * 60 },
  { _tag: 'observed', taskName: 'ai-ready:cron', cron: '*/5 * * * *', maxSilenceSeconds: 20 * 60, maxRuntimeSeconds: 4 * 60 },
  { _tag: 'observed', taskName: 'daily-health-check', cron: '0 22 * * *', maxSilenceSeconds: 36 * 60 * 60, maxRuntimeSeconds: 30 * 60 },
  { _tag: 'observed', taskName: 'drain-skill-dirty', cron: '*/5 * * * *', maxSilenceSeconds: 20 * 60, maxRuntimeSeconds: 4 * 60 },
  { _tag: 'observed', taskName: 'recompute-skill-scores', cron: '0 3 * * *', maxSilenceSeconds: 36 * 60 * 60, maxRuntimeSeconds: 60 * 60 },
  { _tag: 'observed', taskName: 'reconcile-rendered', cron: '20 */6 * * *', maxSilenceSeconds: 15 * 60 * 60, maxRuntimeSeconds: 30 * 60 },
  { _tag: 'observed', taskName: 'send-digests', cron: '0 * * * *', maxSilenceSeconds: 3 * 60 * 60, maxRuntimeSeconds: 50 * 60 },
  { _tag: 'observed', taskName: 'sync-github-skills', cron: '0 * * * *', maxSilenceSeconds: 3 * 60 * 60, maxRuntimeSeconds: 50 * 60 },
  { _tag: 'observed', taskName: 'sync-social-mentions', cron: '30 * * * *', maxSilenceSeconds: 3 * 60 * 60, maxRuntimeSeconds: 30 * 60 },
] as const satisfies readonly SchedulePolicy[]

export function observedSchedulePolicy(taskName: string): ObservedSchedulePolicy {
  const policy = SCHEDULE_POLICY.find(entry => entry.taskName === taskName)
  if (!policy || policy._tag !== 'observed')
    throw new Error(`scheduled task ${taskName} has no observed policy`)
  return policy
}

function terminalVerdict(run: LatestScheduledRun): ScheduleHealth | null {
  if (run.status === 'failed')
    return { _tag: 'latest_failed', alertable: true, error: run.error ?? 'scheduled task failed' }
  if (run.status === 'expired')
    return { _tag: 'latest_expired', alertable: true, error: run.error ?? 'scheduled task expired' }
  return null
}

export function evaluateScheduleHealth(
  policy: SchedulePolicy,
  history: ScheduledRunHistory,
  nowSeconds: number,
): ScheduleHealth {
  if (policy._tag === 'exempt')
    return { _tag: 'exempt', alertable: false, reason: policy.reason }
  const { latest, latestTerminal } = history
  if (!latest)
    return { _tag: 'missing_run', alertable: true }
  if (latest.status === 'started') {
    if (latest.expiresAt <= nowSeconds) {
      return {
        _tag: 'overdue_started',
        alertable: true,
        overdueSeconds: nowSeconds - latest.expiresAt,
      }
    }
    // A run in flight proves the trigger fired, not that the task works. Fall
    // back to the last run that reached a verdict so an hourly task that dies
    // every time cannot read as healthy to a sampler sharing its tick.
    return latestTerminal ? terminalVerdict(latestTerminal) ?? { _tag: 'healthy', alertable: false } : { _tag: 'healthy', alertable: false }
  }
  const verdict = terminalVerdict(latest)
  if (verdict)
    return verdict
  const silenceSeconds = nowSeconds - latest.startedAt
  if (silenceSeconds > policy.maxSilenceSeconds)
    return { _tag: 'missing_cadence', alertable: true, silenceSeconds }
  return { _tag: 'healthy', alertable: false }
}
