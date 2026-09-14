import { defineExternalCheck, defineReportCheck, unavailable } from '@harlan-zw/nuxt-checkin/external'
import { collectDeploy } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.report',
  async run(context) {
    const deployment = (await collectDeploy(context)).latest?.versionId
    if (!deployment)
      return unavailable('Deployed Worker identity is unavailable.')
    return defineReportCheck({
      id: 'skilld.report',
      url: 'https://skilld.dev/api/internal/checkin',
      tokenEnv: 'NUXT_CHECKIN_TOKEN',
      deploymentEnv: 'CHECKIN_DEPLOYMENT',
      site: 'skilld.dev',
      environment: 'production',
      required: ['skilld.daily-health', 'skilld.daily-health-coverage'],
      maxAgeMs: 300_000,
    }).run({ ...context, event: { rootDir: context.rootDir, since: context.since, previous: context.previous, clock: context.clock, env: { ...context.env, CHECKIN_DEPLOYMENT: deployment } } })
  },
})
