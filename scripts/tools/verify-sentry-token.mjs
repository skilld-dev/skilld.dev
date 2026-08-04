#!/usr/bin/env node
// Deploy preflight: verify SENTRY_AUTH_TOKEN can read harlan-zw/skilld BEFORE
// the build. The sentry vite plugin logs upload failures as non-fatal warnings
// and nuxt.config gates `sourcemaps.disable` on token presence, so a missing,
// rotated, or wrong-org secret otherwise ships a green deploy whose client
// errors regress to minified frames (the 2026-07-24 incident). Mirrors
// nuxtseo.com/scripts/tools/verify-sentry-token.mjs.
//
// Wrong-org detail: Sentry org-scoped tokens embed their org and OVERRIDE the
// org configured in nuxt.config, so a token minted under another org makes the
// bundler plugin upload to the wrong org and skip silently. The 403/404 branch
// below names that failure mode.
import process from 'node:process'

export const SENTRY_ORG = 'harlan-zw'
export const SENTRY_PROJECT = 'skilld'

function safeDetail(body) {
  if (!body)
    return ''
  try {
    const parsed = JSON.parse(body)
    if (typeof parsed.detail === 'string')
      return ` ${parsed.detail}`
    if (typeof parsed.error === 'string')
      return ` ${parsed.error}`
  }
  catch {
    // Non-JSON bodies (edge HTML) are noise; never echo them.
  }
  return ''
}

/**
 * Pure classification of the Sentry project-read response.
 * @param {number} status
 * @param {string} body
 * @returns {{ _tag: 'ok' } | { _tag: 'rejected', status: number, diagnostic: string }} ok when the token can read the project, otherwise a fatal diagnostic
 */
export function classifySentryTokenPreflight(status, body) {
  if (status >= 200 && status < 300)
    return { _tag: 'ok' }

  const target = `${SENTRY_ORG}/${SENTRY_PROJECT}`
  if (status === 401) {
    return {
      _tag: 'rejected',
      status,
      diagnostic: `SENTRY_AUTH_TOKEN was rejected by Sentry while checking ${target} (401).`
        + ` Rotate the GitHub secret to a valid token for ${SENTRY_ORG}.`,
    }
  }
  if (status === 403 || status === 404) {
    return {
      _tag: 'rejected',
      status,
      diagnostic: `SENTRY_AUTH_TOKEN cannot access Sentry project ${target} (${status}).${safeDetail(body)}\n`
        + `This matches the org-embedded-in-token mismatch: the token was likely created under another Sentry org, `
        + `so the bundler plugin ignores the configured org "${SENTRY_ORG}" and uploads against the wrong org.\n`
        + `Rotate the GitHub secret SENTRY_AUTH_TOKEN to a token created in the ${SENTRY_ORG} organization.`,
    }
  }
  return {
    _tag: 'rejected',
    status,
    diagnostic: `Unexpected Sentry response while checking ${target}: ${status}.${safeDetail(body)}`,
  }
}

function fail(message) {
  if (process.env.GITHUB_ACTIONS) {
    const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
    console.error(`::error title=Invalid Sentry auth token::${escaped}`)
  }
  console.error(`[sentry-preflight] ${message}`)
  process.exit(1)
}

async function main() {
  const token = process.env.SENTRY_AUTH_TOKEN
  if (!token) {
    fail(
      `SENTRY_AUTH_TOKEN is required for deploy sourcemap uploads to ${SENTRY_ORG}/${SENTRY_PROJECT}. `
      + 'Create a token in that Sentry organization and set the GitHub secret before deploying.',
    )
  }

  const apiBase = process.env.SENTRY_API_BASE_URL || 'https://sentry.io'
  const url = new URL(`/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/`, apiBase)

  let response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    })
  }
  catch (error) {
    fail(`Could not reach Sentry to verify ${SENTRY_ORG}/${SENTRY_PROJECT}: ${error instanceof Error ? error.message : String(error)}`)
  }

  const body = await response.text().catch(() => '')
  const result = classifySentryTokenPreflight(response.status, body)
  if (result._tag === 'ok') {
    console.log(`[sentry-preflight] Verified SENTRY_AUTH_TOKEN can access ${SENTRY_ORG}/${SENTRY_PROJECT}.`)
    return
  }
  fail(result.diagnostic)
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (invokedDirectly)
  await main()
