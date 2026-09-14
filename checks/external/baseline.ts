import { defineExternalCheck, pass } from '@harlan-zw/nuxt-checkin/external'
import { deriveBaselineFlag } from '../_helpers/observability.mjs'

export default defineExternalCheck({
  id: 'skilld.baseline',
  run(context) {
    const baseline = deriveBaselineFlag(context.since.toString(), context.now.toISOString())
    return baseline._tag === 'invalid'
      ? { _tag: 'Warn' as const, reason: 'The comparison window is invalid.', evidence: baseline, coverage: 'incomplete' as const }
      : pass(baseline)
  },
})
