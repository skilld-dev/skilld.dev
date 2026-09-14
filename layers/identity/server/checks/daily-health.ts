import type { DailyHealthCheckEvent } from '../utils/daily-health-checkin'
import { defineCheck, fail, pass, warn } from '@harlan-zw/nuxt-checkin/server'
import { collectDailyHealth } from '../utils/daily-health-checkin'

export default defineCheck<DailyHealthCheckEvent>({
  id: 'skilld.daily-health',
  async run(context) {
    const summary = await collectDailyHealth(context)
    const evidence = { reasons: summary.reasons }
    const result = summary.status === 'RED'
      ? fail(summary.reasons.join(' '), evidence)
      : summary.status === 'AMBER' ? warn(summary.reasons.join(' '), evidence) : pass(evidence)
    return summary.warnings.length && result._tag !== 'Pass'
      ? { ...result, coverage: 'incomplete' as const }
      : result
  },
})
