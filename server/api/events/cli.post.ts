import { CliEventInput } from '~~/server/schemas/cli-event'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: CliEventInput,
  handler: async ({ event, body, platform }) => {
    const dataset = platform.SKILLD_ANALYTICS ?? platform.env.SKILLD_ANALYTICS
    if (!dataset || typeof dataset.writeDataPoint !== 'function')
      throw createError({ statusCode: 500, message: 'Analytics Engine binding missing' })

    const country = getHeader(event, 'cf-ipcountry') ?? 'XX'
    dataset.writeDataPoint({
      blobs: [
        body.event,
        body.surface,
        body.sourceKind ?? '',
        body.slug ?? '',
        body.cliVersion,
        body.agent ?? '',
        country,
      ],
      doubles: [1, body.durationMs ?? 0],
      indexes: [body.userId ? `u:${body.userId}` : 'anon'],
    })

    return { ok: true as const }
  },
})
