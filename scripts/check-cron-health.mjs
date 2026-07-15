import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

export const CRON_EXPECTATIONS = [
  { cron: '*/5 * * * *', maxAgeMs: 15 * MINUTE_MS },
  { cron: '0 * * * *', maxAgeMs: 2 * HOUR_MS },
  { cron: '15 * * * *', maxAgeMs: 2 * HOUR_MS },
  { cron: '30 * * * *', maxAgeMs: 2 * HOUR_MS },
  { cron: '45 * * * *', maxAgeMs: 2 * HOUR_MS },
  { cron: '20 */6 * * *', maxAgeMs: 13 * HOUR_MS },
  { cron: '0 3 * * *', maxAgeMs: 27 * HOUR_MS },
]

export function evaluateCronHealth(
  rows,
  {
    nowMs = Date.now(),
    expectations = CRON_EXPECTATIONS,
    consecutiveFailureThreshold = 2,
  } = {},
) {
  const schedules = []
  const issues = []

  for (const expectation of expectations) {
    const runs = rows
      .filter(row => row.cron === expectation.cron)
      .toSorted((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime))
    const latest = runs[0]

    if (!latest) {
      issues.push({
        cron: expectation.cron,
        type: 'missing',
        message: `No invocation found for ${expectation.cron}`,
      })
      schedules.push({ cron: expectation.cron, latest: null, status: null, consecutiveFailures: 0 })
      continue
    }

    const latestAt = Date.parse(latest.datetime)
    const ageMs = nowMs - latestAt
    let consecutiveFailures = 0
    for (const run of runs) {
      if (run.status === 'success')
        break
      consecutiveFailures += 1
    }

    schedules.push({
      cron: expectation.cron,
      latest: latest.datetime,
      status: latest.status,
      ageMs,
      consecutiveFailures,
    })

    if (!Number.isFinite(latestAt) || ageMs > expectation.maxAgeMs) {
      issues.push({
        cron: expectation.cron,
        type: 'stale',
        message: `Latest ${expectation.cron} invocation is ${formatDuration(ageMs)} old`,
      })
    }

    if (consecutiveFailures >= consecutiveFailureThreshold) {
      issues.push({
        cron: expectation.cron,
        type: 'repeated-failure',
        message: `${expectation.cron} failed ${consecutiveFailures} consecutive times`,
      })
    }
  }

  return { ok: issues.length === 0, schedules, issues }
}

export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs))
    return 'an unknown duration'
  if (durationMs < HOUR_MS)
    return `${Math.max(0, Math.round(durationMs / MINUTE_MS))}m`
  return `${Math.max(0, Math.round(durationMs / HOUR_MS))}h`
}

async function fetchCronEvents({ accountId, apiToken, workerName, nowMs }) {
  const end = new Date(nowMs)
  const start = new Date(nowMs - 36 * HOUR_MS)
  const workerLiteral = JSON.stringify(workerName)
  const query = `query CronEvents($accountTag: string!, $start: DateTime!, $end: DateTime!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsScheduled(
          limit: 1000
          filter: {
            scriptName: ${workerLiteral}
            datetime_geq: $start
            datetime_leq: $end
          }
          orderBy: [datetime_DESC]
        ) {
          cron
          datetime
          status
        }
      }
    }
  }`

  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: accountId,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    }),
  })
  const body = await response.json()

  if (!response.ok)
    throw new Error(`Cloudflare GraphQL returned HTTP ${response.status}`)
  if (body.errors?.length)
    throw new Error(body.errors.map(error => error.message).join('; '))

  return body.data?.viewer?.accounts?.[0]?.workersInvocationsScheduled ?? []
}

async function main() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const workerName = process.env.CF_WORKER_NAME || 'skilld-dev'

  if (!apiToken)
    throw new Error('CLOUDFLARE_API_TOKEN is required')
  if (!accountId)
    throw new Error('CLOUDFLARE_ACCOUNT_ID is required')

  const nowMs = Date.now()
  const rows = await fetchCronEvents({ accountId, apiToken, workerName, nowMs })
  const health = evaluateCronHealth(rows, { nowMs })

  console.log(`Cron health for ${workerName} at ${new Date(nowMs).toISOString()}`)
  for (const schedule of health.schedules) {
    const latest = schedule.latest ?? 'never'
    const status = schedule.status ?? 'missing'
    console.log(`${schedule.cron}: ${status}, latest ${latest}`)
  }

  if (!health.ok) {
    for (const issue of health.issues)
      console.error(`ERROR: ${issue.message}`)
    process.exitCode = 1
  }
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : ''
if (entrypoint === fileURLToPath(import.meta.url))
  await main()
