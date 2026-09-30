#!/usr/bin/env node
/**
 * Post-deploy smoke for hosted Artifact delivery.
 *
 * Requests one public Resolution for `skilld-dev/skills` `find-skill` and
 * polls it until it is `ready`. The page smoke in `production:deploy` never
 * exercised the build queue, so every build failed for eleven days
 * (2026-08-21 to 2026-09-01) behind green deploys. This check fails the
 * deploy job when a build cannot reach `ready`.
 *
 * No dependencies. Node 22+.
 *
 *   node scripts/smoke-artifact-resolution.mjs [--base-url URL] [--timeout-ms N]
 *
 * Env: PRODUCTION_SMOKE_BASE_URL (default https://skilld.dev)
 */
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const SMOKE_SOURCE = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'named-skill', name: 'find-skill' },
}

/**
 * @typedef {'github_unreachable' | 'build_broken'} SmokeCause
 * @typedef {{ _tag: 'ready', resolutionId: string, artifactId: string, polls: number }
 *   | { _tag: 'failed', reason: 'request_rejected' | 'build_failed' | 'build_blocked' | 'build_revoked' | 'timeout' | 'invalid_response', detail: string, resolutionId?: string, cause?: SmokeCause }} SmokeOutcome
 */

export const GITHUB_PROBE_URL = 'https://api.github.com/'
const GITHUB_PROBE_TIMEOUT_MS = 8000

/**
 * Ask api.github.com whether it answers at all.
 *
 * On 2026-09-30 the path from Cloudflare Workers to GitHub failed for hours.
 * Every build stalled on its first GitHub read, and the smoke could only say
 * "timeout". This probe runs from the runner, so it sees the GitHub side of
 * that fault, not the Cloudflare side. Any HTTP answer below 500 counts as
 * reachable, including a 403 from a rate limit.
 *
 * @returns {Promise<{ _tag: 'reachable', status: number } | { _tag: 'unreachable', reason: string }>} Whether GitHub answered.
 */
export async function probeGithub(fetch = globalThis.fetch) {
  try {
    const response = await fetch(GITHUB_PROBE_URL, {
      headers: { 'user-agent': 'skilld-artifact-smoke/1', 'accept': 'application/vnd.github+json' },
      signal: AbortSignal.timeout(GITHUB_PROBE_TIMEOUT_MS),
    })
    await response.body?.cancel()
    if (response.status >= 500)
      return { _tag: 'unreachable', reason: `answered ${response.status}` }
    return { _tag: 'reachable', status: response.status }
  }
  catch (error) {
    return { _tag: 'unreachable', reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Add the likely cause to a build that did not reach `ready` for a reason a
 * GitHub outage can produce: still pending at the deadline, or failed as a
 * retryable `SERVICE_UNAVAILABLE`. A rejected, blocked or revoked build is a
 * verdict about the Skill, so it is left alone.
 *
 * @param {Extract<SmokeOutcome, { _tag: 'failed' }>} outcome
 * @param {{ retryable: boolean }} shape
 * @param {() => ReturnType<typeof probeGithub>} probeFn
 * @returns {Promise<Extract<SmokeOutcome, { _tag: 'failed' }>>} The outcome, with a cause when one applies.
 */
async function explainStall(outcome, shape, probeFn) {
  if (!shape.retryable)
    return outcome
  const probe = await probeFn()
  if (probe._tag === 'unreachable') {
    return {
      ...outcome,
      cause: 'github_unreachable',
      detail: `${outcome.detail}. Cause: GitHub unreachable from Cloudflare. ${GITHUB_PROBE_URL} did not answer from the runner (${probe.reason}). Rerun the smoke when GitHub recovers.`,
    }
  }
  return {
    ...outcome,
    cause: 'build_broken',
    detail: `${outcome.detail}. Cause: build broken. ${GITHUB_PROBE_URL} answered ${probe.status} from the runner, so GitHub is up. Check the artifact-build queue logs.`,
  }
}

/**
 * @param {{
 *   baseUrl: string
 *   timeoutMs: number
 *   fetch?: typeof globalThis.fetch
 *   wait?: (ms: number) => Promise<void>
 *   now?: () => number
 *   log?: (line: string) => void
 *   probe?: () => ReturnType<typeof probeGithub>
 * }} options
 * @returns {Promise<SmokeOutcome>} `ready` once the build finishes, else the first failure.
 */
export async function smokeArtifactResolution(options) {
  const fetch = options.fetch ?? globalThis.fetch
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})
  const probe = options.probe ?? (() => probeGithub())
  const headers = {
    'accept': 'application/json',
    'cache-control': 'no-cache',
    'user-agent': 'skilld-artifact-smoke/1',
  }

  const created = await fetch(new URL('/api/v1/resolutions', options.baseUrl), {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/json',
      'idempotency-key': `smoke-${randomUUID()}`,
    },
    body: JSON.stringify({ source: SMOKE_SOURCE }),
  })
  const createdBody = await readJson(created)
  if (created.status !== 200 && created.status !== 202) {
    return {
      _tag: 'failed',
      reason: 'request_rejected',
      detail: `POST /api/v1/resolutions returned ${created.status}: ${JSON.stringify(createdBody)}`,
    }
  }
  if (typeof createdBody?.resolutionId !== 'string') {
    return {
      _tag: 'failed',
      reason: 'invalid_response',
      detail: `POST /api/v1/resolutions returned no resolutionId: ${JSON.stringify(createdBody)}`,
    }
  }
  const resolutionId = createdBody.resolutionId
  log(`resolution ${resolutionId} created (${created.status})`)

  const deadline = now() + options.timeoutMs
  let body = createdBody
  let polls = 0
  for (;;) {
    const terminal = classify(body, resolutionId, polls)
    if (terminal) {
      return terminal._tag === 'failed' && terminal.reason === 'build_failed'
        ? await explainStall(terminal, { retryable: body.retryable === true }, probe)
        : terminal
    }
    log(`resolution ${resolutionId} ${body.state}${body.stage ? ` (${body.stage})` : ''}`)
    if (now() >= deadline) {
      return await explainStall({
        _tag: 'failed',
        reason: 'timeout',
        detail: `resolution ${resolutionId} still ${body.state}${body.stage ? ` (${body.stage})` : ''} after ${options.timeoutMs}ms`,
        resolutionId,
      }, { retryable: true }, probe)
    }
    await wait(Math.min(Math.max(Number(body.pollAfterMs) || 1000, 250), 5000))
    polls++
    const polled = await fetch(new URL(`/api/v1/resolutions/${resolutionId}`, options.baseUrl), { headers })
    body = await readJson(polled)
    if (polled.status !== 200) {
      return {
        _tag: 'failed',
        reason: 'invalid_response',
        detail: `GET /api/v1/resolutions/${resolutionId} returned ${polled.status}: ${JSON.stringify(body)}`,
        resolutionId,
      }
    }
  }
}

/** @returns {SmokeOutcome | null} A terminal outcome, or null while the build is pending. */
function classify(body, resolutionId, polls) {
  switch (body?.state) {
    case 'ready':
      return { _tag: 'ready', resolutionId, artifactId: String(body.artifact?.artifactId), polls }
    case 'failed':
      return {
        _tag: 'failed',
        reason: 'build_failed',
        detail: `resolution ${resolutionId} failed with ${body.code}${body.retryable ? ' (retryable)' : ''}`,
        resolutionId,
      }
    case 'blocked':
      return {
        _tag: 'failed',
        reason: 'build_blocked',
        detail: `resolution ${resolutionId} was blocked by checks: ${JSON.stringify(body.checkResults)}`,
        resolutionId,
      }
    case 'revoked':
      return {
        _tag: 'failed',
        reason: 'build_revoked',
        detail: `resolution ${resolutionId} was revoked: ${body.reasonCode}`,
        resolutionId,
      }
    case 'pending':
      return null
    default:
      return {
        _tag: 'failed',
        reason: 'invalid_response',
        detail: `resolution ${resolutionId} has an unknown state: ${JSON.stringify(body)}`,
        resolutionId,
      }
  }
}

async function readJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    // A non-JSON body is reported to the caller through the status check.
    return { raw: text.slice(0, 500) }
  }
}

function readFlag(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

async function main() {
  const baseUrl = readFlag('--base-url', process.env.PRODUCTION_SMOKE_BASE_URL ?? 'https://skilld.dev')
  const timeoutMs = Number(readFlag('--timeout-ms', '120000'))
  const outcome = await smokeArtifactResolution({
    baseUrl,
    timeoutMs,
    log: line => console.log(line),
  })
  if (outcome._tag === 'ready') {
    console.log(`Artifact smoke passed: ${outcome.resolutionId} is ready (artifact ${outcome.artifactId}, ${outcome.polls} polls)`)
    return
  }
  console.error(`Artifact smoke failed (${outcome.reason}${outcome.cause ? `, ${outcome.cause}` : ''}): ${outcome.detail}`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  })
}
