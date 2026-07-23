export type CloudflareSchedules
  = | { _tag: 'available', crons: string[] }
    | {
      _tag: 'unavailable'
      reason: 'authorization' | 'rate_limit' | 'provider' | 'parse' | 'missing_credentials'
      status: number | null
      diagnostic: string
    }

export type ScheduleParity
  = | {
    _tag: 'aligned'
    expected: string[]
    deployed: string[]
    missing: []
    extra: []
  }
  | {
    _tag: 'drift'
    expected: string[]
    deployed: string[]
    missing: string[]
    extra: string[]
  }

export type ScheduleParityArgs
  = | { _tag: 'local_check' }
    | { _tag: 'remote_dry_run' }
    | { _tag: 'invalid', reason: string }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function diagnostic(body: unknown): string {
  const value = record(body)
  const errors = value?.errors
  if (Array.isArray(errors)) {
    const messages = errors.flatMap((candidate) => {
      const item = record(candidate)
      return typeof item?.message === 'string' ? [item.message] : []
    })
    if (messages.length)
      return messages.join('; ')
  }
  return 'Cloudflare schedules response was unavailable.'
}

export function parseCloudflareSchedulesResponse(status: number, body: unknown): CloudflareSchedules {
  if (status === 401 || status === 403) {
    return {
      _tag: 'unavailable',
      reason: 'authorization',
      status,
      diagnostic: `Cloudflare schedule authorization failed with HTTP ${status}: ${diagnostic(body)}`,
    }
  }
  if (status === 429) {
    return {
      _tag: 'unavailable',
      reason: 'rate_limit',
      status,
      diagnostic: `Cloudflare schedule inspection was rate limited: ${diagnostic(body)}`,
    }
  }
  if (status < 200 || status >= 300) {
    return {
      _tag: 'unavailable',
      reason: 'provider',
      status,
      diagnostic: `Cloudflare schedule inspection failed with HTTP ${status}: ${diagnostic(body)}`,
    }
  }
  const envelope = record(body)
  const result = record(envelope?.result)
  const schedules = result?.schedules
  if (envelope?.success !== true || !Array.isArray(schedules)) {
    return {
      _tag: 'unavailable',
      reason: 'parse',
      status,
      diagnostic: 'Cloudflare schedules response did not match the documented result.schedules shape.',
    }
  }
  const crons: string[] = []
  for (const candidate of schedules) {
    const schedule = record(candidate)
    if (typeof schedule?.cron !== 'string' || !schedule.cron.trim()) {
      return {
        _tag: 'unavailable',
        reason: 'parse',
        status,
        diagnostic: 'Cloudflare schedules response contained an invalid cron.',
      }
    }
    crons.push(schedule.cron)
  }
  return { _tag: 'available', crons: [...new Set(crons)].sort() }
}

export function calculateScheduleParity(expectedInput: string[], deployedInput: string[]): ScheduleParity {
  const expected = [...new Set(expectedInput)].sort()
  const deployed = [...new Set(deployedInput)].sort()
  const deployedSet = new Set(deployed)
  const expectedSet = new Set(expected)
  const missing = expected.filter(cron => !deployedSet.has(cron))
  const extra = deployed.filter(cron => !expectedSet.has(cron))
  return missing.length || extra.length
    ? { _tag: 'drift', expected, deployed, missing, extra }
    : { _tag: 'aligned', expected, deployed, missing: [], extra: [] }
}

export function parseScheduleParityArgs(args: string[]): ScheduleParityArgs {
  if (args.length === 0)
    return { _tag: 'local_check' }
  if (args.length === 2 && args[0] === '--remote' && args[1] === '--dry-run')
    return { _tag: 'remote_dry_run' }
  return {
    _tag: 'invalid',
    reason: 'Only a local check or the exact read-only arguments --remote --dry-run are allowed.',
  }
}

export async function loadCloudflareSchedules(input: {
  accountId: string | null
  scriptName: string
  token: string | null
  fetcher?: typeof fetch
}): Promise<CloudflareSchedules> {
  if (!input.accountId || !input.token) {
    return {
      _tag: 'unavailable',
      reason: 'missing_credentials',
      status: null,
      diagnostic: 'Cloudflare account ID or API token is unavailable.',
    }
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.scriptName)}/schedules`
  const response = await (input.fetcher ?? fetch)(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${input.token}` },
  }).catch(error => ({
    networkError: error instanceof Error ? error.message : String(error),
  }))
  if ('networkError' in response) {
    return {
      _tag: 'unavailable',
      reason: 'provider',
      status: null,
      diagnostic: `Cloudflare schedule inspection request failed: ${response.networkError}`,
    }
  }
  const body = await response.json().catch(error => ({
    parseError: error instanceof Error ? error.message : String(error),
  }))
  return parseCloudflareSchedulesResponse(response.status, body)
}
