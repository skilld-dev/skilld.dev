import { checkReport, defineExternalCheck, unavailable } from '@harlan-zw/nuxt-checkin/external'
import { collectD1, collectDeploy } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.health-email',
  async run(context) {
    const deployment = (await collectDeploy(context)).latest?.versionId
    const healthReport = (await collectD1(context)).healthEmail?.[0]?.checkin
    return deployment
      ? checkReport(healthReport, {
          now: context.clock(),
          identity: { site: 'skilld.dev', environment: 'production', deployment },
          required: ['skilld.daily-health', 'skilld.daily-health-coverage'],
          maxAgeMs: 36 * 60 * 60 * 1000,
        })
      : unavailable('Deployed Worker identity is unavailable.')
  },
})
