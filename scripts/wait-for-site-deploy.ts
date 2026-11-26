// Waits for the matching `Deploy to Cloudflare` run on main before deploying
// the Harness Worker. Requires GITHUB_TOKEN (`actions: read`), GITHUB_REPOSITORY, and GITHUB_SHA.
import { appendFileSync } from 'node:fs'
import process from 'node:process'
import { waitForSiteDeploy } from './lib/site-deploy-wait'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value)
    throw new Error(`Missing required environment variable ${name}.`)
  return value
}

async function main(): Promise<void> {
  const repository = requireEnv('GITHUB_REPOSITORY')
  const sha = requireEnv('GITHUB_SHA')
  const token = requireEnv('GITHUB_TOKEN')

  const result = await waitForSiteDeploy({ repository, sha, token })

  let message: string
  switch (result._tag) {
    case 'succeeded':
      message = result.supersededByRunId === undefined
        ? `Site deploy run ${result.runId} succeeded.`
        : `Site deploy run ${result.runId} was superseded by run ${result.supersededByRunId}, which succeeded.`
      break
    case 'not-triggered':
      message = `No Deploy to Cloudflare run started for ${sha.slice(0, 12)}; continuing.`
      break
    case 'failed':
      message = `Site deploy run ${result.runId} ended with ${result.conclusion ?? 'unknown'}. Stopping Harness deploy.`
      process.exitCode = 1
      break
    case 'timed-out':
      message = `Timed out waiting for Deploy to Cloudflare (last status: ${result.lastStatus ?? 'none'}).`
      process.exitCode = 1
      break
  }

  console.log(message)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
