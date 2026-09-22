import { CliEventInput } from '~~/server/schemas/cli-event'
import { analyticsCountry, cliDataPoint } from '#shared/analytics'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: CliEventInput,
  handler: async ({ event, body, platform }) => {
    const dataset = platform.env.SKILLD_ANALYTICS
    if (!dataset || typeof dataset.writeDataPoint !== 'function')
      throw createError({ statusCode: 500, message: 'Analytics Engine binding missing' })

    dataset.writeDataPoint(cliDataPoint({
      event: body.event,
      surface: body.surface,
      sourceKind: body.sourceKind ?? '',
      slug: body.slug ?? '',
      cliVersion: body.cliVersion,
      agent: body.agent ?? '',
      country: analyticsCountry(getHeader(event, 'cf-ipcountry')),
      durationMs: body.durationMs ?? 0,
    }))

    return { ok: true as const }
  },
})
