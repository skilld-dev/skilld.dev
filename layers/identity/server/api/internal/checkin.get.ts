import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { isValidCheckinAuthorization } from '../../utils/checkin-auth'
import { buildDailyHealthCheck, frontDoorFetcher } from '../../utils/daily-health-check'
import { runDailyHealthChecks } from '../../utils/daily-health-checkin'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig(event)
  if (!isValidCheckinAuthorization(getHeader(event, 'authorization'), config.checkinToken))
    throw createError({ statusCode: 401, message: 'Check-in authorization failed.' })
  const env = resolveCloudflareBindings<Cloudflare.Env>(event.context)
  const deployment = env?.CF_VERSION_METADATA?.id
  if (!env?.DB || !deployment)
    throw createError({ statusCode: 503, message: 'Check-in bindings or deployment identity are missing.' })
  return runDailyHealthChecks(env.DB, (db, options) => buildDailyHealthCheck(db, {
    ...options,
    fetcher: frontDoorFetcher(env),
    githubToken: env.GITHUB_TOKEN,
    workerVersion: deployment,
  }), new Date(), deployment)
})
