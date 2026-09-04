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
 * @typedef {{ _tag: 'ready', resolutionId: string, artifactId: string, polls: number }
 *   | { _tag: 'failed', reason: 'request_rejected' | 'build_failed' | 'build_blocked' | 'build_revoked' | 'timeout' | 'invalid_response', detail: string, resolutionId?: string }} SmokeOutcome
 */

/**
 * @param {{
 *   baseUrl: string
 *   timeoutMs: number
 *   fetch?: typeof globalThis.fetch
 *   wait?: (ms: number) => Promise<void>
 *   now?: () => number
 *   log?: (line: string) => void
 * }} options
 * @returns {Promise<SmokeOutcome>} `ready` once the build finishes, else the first failure.
 */
export async function smokeArtifactResolution(options) {
  const fetch = options.fetch ?? globalThis.fetch
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})
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
    if (terminal)
      return terminal
    log(`resolution ${resolutionId} ${body.state}${body.stage ? ` (${body.stage})` : ''}`)
    if (now() >= deadline) {
      return {
        _tag: 'failed',
        reason: 'timeout',
        detail: `resolution ${resolutionId} still ${body.state}${body.stage ? ` (${body.stage})` : ''} after ${options.timeoutMs}ms`,
        resolutionId,
      }
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
  console.error(`Artifact smoke failed (${outcome.reason}): ${outcome.detail}`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  })
}
