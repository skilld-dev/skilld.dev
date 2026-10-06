/**
 * The state of one Skill's run checks, and the flag it earns.
 *
 * A run check is the Resolution request `skilld run OWNER/REPOSITORY/NAME`
 * sends, made by the `sweep-skill-runs` task. This module is the pure core:
 * the sweep stores what it returns, and the flag route reads the result.
 */

/** Failures in a row, each for a reason a retry cannot change, that flag a Skill. */
export const FLAG_AFTER_FAILURES = 2

export type RunCheckState
  = | { _tag: 'unchecked' }
    | { _tag: 'ready' }
  /** The last check failed for a reason a retry can change, such as `RATE_LIMITED`. */
    | { _tag: 'transient', tag: string, detail: string | null, since: number }
  /** The last check that said anything about the Skill failed for a reason a retry cannot change. */
    | {
      _tag: 'failing'
      tag: string
      detail: string | null
      /** Unix seconds this tag was first seen in a row. */
      since: number
      /** Unix seconds the last failure in the streak settled. */
      failedAt: number
      /** Checks in a row that failed this way, with any tag. */
      streak: number
    }

/** How one check ended. */
export type RunCheckOutcome
  = | { _tag: 'ready' }
    | { _tag: 'failing', tag: string, detail: string | null, retryable: boolean }

export type RunCheckFlag
  = | { _tag: 'clear' }
    | { _tag: 'flagged', tag: string, detail: string | null, failedAt: number }

/**
 * The state after one more check settles.
 *
 * A pass clears everything. A failure a retry cannot change adds one to the
 * streak. A failure a retry can change says nothing about the Skill: over a
 * known failure it keeps that failure and its streak, so a spent quota never
 * hides a broken Skill and never counts toward a flag.
 */
export function nextRunCheckState(previous: RunCheckState, outcome: RunCheckOutcome, now: number): RunCheckState {
  if (outcome._tag === 'ready')
    return { _tag: 'ready' }
  if (outcome.retryable) {
    if (previous._tag === 'failing')
      return previous
    const since = previous._tag === 'transient' && previous.tag === outcome.tag ? previous.since : now
    return { _tag: 'transient', tag: outcome.tag, detail: outcome.detail, since }
  }
  const streak = previous._tag === 'failing' ? previous.streak + 1 : 1
  const since = previous._tag === 'failing' && previous.tag === outcome.tag ? previous.since : now
  return { _tag: 'failing', tag: outcome.tag, detail: outcome.detail, since, failedAt: now, streak }
}

/** The flag a Skill page shows beside its run command, if any. */
export function runCheckFlag(state: RunCheckState): RunCheckFlag {
  if (state._tag !== 'failing' || state.streak < FLAG_AFTER_FAILURES)
    return { _tag: 'clear' }
  return { _tag: 'flagged', tag: state.tag, detail: state.detail, failedAt: state.failedAt }
}

/** What one `artifact_run_checks` row stores for its state. */
export interface RunCheckColumns {
  outcome: 'ready' | 'failing' | null
  tag: string | null
  detail: string | null
  retryable: 0 | 1
  failing_since: number | null
  failure_streak: number
  failed_at: number | null
}

/**
 * The state one row stores.
 *
 * A row the sweep wrote before the streak existed holds a streak of 0 over a
 * failure, so it counts that failure once.
 */
export function runCheckStateOf(row: RunCheckColumns & { settled_at: number | null }): RunCheckState {
  if (row.outcome === null)
    return { _tag: 'unchecked' }
  if (row.outcome === 'ready')
    return { _tag: 'ready' }
  const tag = row.tag ?? 'UNKNOWN'
  const since = row.failing_since ?? row.settled_at ?? 0
  if (row.retryable === 1)
    return { _tag: 'transient', tag, detail: row.detail, since }
  return {
    _tag: 'failing',
    tag,
    detail: row.detail,
    since,
    failedAt: row.failed_at ?? row.settled_at ?? since,
    streak: Math.max(1, row.failure_streak),
  }
}

export function runCheckColumns(state: RunCheckState): RunCheckColumns {
  switch (state._tag) {
    case 'unchecked':
      return { outcome: null, tag: null, detail: null, retryable: 0, failing_since: null, failure_streak: 0, failed_at: null }
    case 'ready':
      return { outcome: 'ready', tag: null, detail: null, retryable: 0, failing_since: null, failure_streak: 0, failed_at: null }
    case 'transient':
      return { outcome: 'failing', tag: state.tag, detail: state.detail, retryable: 1, failing_since: state.since, failure_streak: 0, failed_at: null }
    case 'failing':
      return { outcome: 'failing', tag: state.tag, detail: state.detail, retryable: 0, failing_since: state.since, failure_streak: state.streak, failed_at: state.failedAt }
  }
}
