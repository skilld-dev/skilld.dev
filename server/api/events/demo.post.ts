import { presentDemoEngagement } from '~~/server/presenters/demo-engagement'
import { DemoEngagementInput } from '~~/server/schemas/demo-engagement'
import { analyticsCountry } from '#shared/analytics'
import { demoEngagementDataPoint } from '#shared/demo-engagement'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: DemoEngagementInput,
  handler: async ({ event, body, platform }) => {
    const dataset = platform.env.SKILLD_WEB_ANALYTICS
    if (!dataset)
      throw createError({ statusCode: 500, message: 'Analytics Engine binding missing' })
    dataset.writeDataPoint(demoEngagementDataPoint(body, analyticsCountry(getHeader(event, 'cf-ipcountry'))))
  },
  presenter: presentDemoEngagement,
})
