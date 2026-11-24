import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { defineEventHandler, getHeader, HTTPError, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { isValidCheckinAuthorization } from '../../utils/checkin-auth'
import { buildDailyHealthCheck, frontDoorFetcher } from '../../utils/daily-health-check'
import { runDailyHealthChecks } from '../../utils/daily-health-checkin'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig()
  if (!isValidCheckinAuthorization(getHeader(event, 'authorization'), config.checkinToken))
    throw new HTTPError({ status: 401, message: 'Check-in authorization failed.', headers: { 'cache-control': 'no-store' } })
  const env = event.context.platform?.env ?? resolveCloudflareBindings<Cloudflare.Env>(event)
  const deployment = env?.CF_VERSION_METADATA?.id
  if (!env?.DB || !deployment)
    throw new HTTPError({ status: 503, message: 'Check-in bindings or deployment identity are missing.', headers: { 'cache-control': 'no-store' } })
  return runDailyHealthChecks(env.DB, (db, options) => buildDailyHealthCheck(db, {
    ...options,
    fetcher: frontDoorFetcher(env),
    githubToken: env.GITHUB_TOKEN,
    workerVersion: deployment,
  }), new Date(), deployment)
})
