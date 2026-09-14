import type { DailyHealthCheckEvent } from '../utils/daily-health-checkin'
import { defineCheck, pass, unavailable } from '@harlan-zw/nuxt-checkin/server'
import { collectDailyHealth } from '../utils/daily-health-checkin'

export default defineCheck<DailyHealthCheckEvent>({
  id: 'skilld.daily-health-coverage',
  async run(context) {
    const summary = await collectDailyHealth(context)
    return summary.warnings.length
      ? unavailable('Daily health evidence is incomplete. See report warnings.')
      : pass()
  },
})
