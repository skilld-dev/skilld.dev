import type { RunCheckOutcome, RunCheckState } from '../../layers/artifact-delivery/server/utils/run-check-state'
import { describe, expect, it } from 'vitest'
import { nextRunCheckState, runCheckFlag } from '../../layers/artifact-delivery/server/utils/run-check-state'

const tooLarge: RunCheckOutcome = { _tag: 'failing', tag: 'CHECK_BLOCKED:source-policy', detail: 'The Skill folder packs to 12 MiB. The limit is 10 MiB.', retryable: false }
const gone: RunCheckOutcome = { _tag: 'failing', tag: 'SOURCE_NOT_FOUND', detail: null, retryable: false }
const spentQuota: RunCheckOutcome = { _tag: 'failing', tag: 'RATE_LIMITED', detail: null, retryable: true }
const unavailable: RunCheckOutcome = { _tag: 'failing', tag: 'SERVICE_UNAVAILABLE', detail: null, retryable: true }
const passed: RunCheckOutcome = { _tag: 'ready' }

/** Settle each check in order, one minute apart from t=1000. */
function afterChecks(outcomes: RunCheckOutcome[]): RunCheckState {
  return outcomes.reduce<RunCheckState>(
    (state, outcome, index) => nextRunCheckState(state, outcome, 1000 + index * 60),
    { _tag: 'unchecked' },
  )
}

describe('run check flag', () => {
  it('flags a Skill after two checks in a row fail for a reason a retry cannot change', () => {
    expect(runCheckFlag(afterChecks([tooLarge]))).toEqual({ _tag: 'clear' })
    expect(runCheckFlag(afterChecks([tooLarge, tooLarge]))).toEqual({
      _tag: 'flagged',
      tag: 'CHECK_BLOCKED:source-policy',
      detail: 'The Skill folder packs to 12 MiB. The limit is 10 MiB.',
      failedAt: 1060,
    })
  })

  it('flags two failures in a row even when the reason changed, and shows the latest', () => {
    expect(runCheckFlag(afterChecks([tooLarge, gone]))).toEqual({ _tag: 'flagged', tag: 'SOURCE_NOT_FOUND', detail: null, failedAt: 1060 })
  })

  it('clears the flag after one passing check, and one later failure does not bring it back', () => {
    expect(runCheckFlag(afterChecks([tooLarge, tooLarge, passed]))).toEqual({ _tag: 'clear' })
    expect(runCheckFlag(afterChecks([tooLarge, tooLarge, passed, tooLarge]))).toEqual({ _tag: 'clear' })
  })

  it('never flags for failures a retry can change', () => {
    expect(runCheckFlag(afterChecks([spentQuota, unavailable, spentQuota, unavailable]))).toEqual({ _tag: 'clear' })
    // A spent quota between two real failures does not count as either of them.
    expect(runCheckFlag(afterChecks([tooLarge, spentQuota]))).toEqual({ _tag: 'clear' })
    expect(runCheckFlag(afterChecks([tooLarge, spentQuota, tooLarge]))).toMatchObject({ _tag: 'flagged', failedAt: 1120 })
  })

  it('keeps a flag through a spent quota, dated to the last real failure', () => {
    expect(runCheckFlag(afterChecks([tooLarge, tooLarge, spentQuota, unavailable]))).toMatchObject({ _tag: 'flagged', failedAt: 1060 })
  })
})
