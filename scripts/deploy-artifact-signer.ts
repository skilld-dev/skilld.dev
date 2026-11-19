// The Artifact signer has no smoke of its own: the site deploy and the
// Artifact build smoke that follow it in the workflow exercise it.
import { resolve } from 'node:path'
import { unstable_readConfig } from 'wrangler'
import { deployArtifactSigner } from './lib/artifact-signer-deploy'
import { withTransientRetry } from './lib/cloudflare-retry'
import { createCommand, wait } from './lib/spawn-command'
import { parseRootConfig } from './lib/trusted-root-ceremony'

const workerDirectory = resolve(process.cwd(), 'workers/artifact-signer')
const deploy = withTransientRetry(
  createCommand(resolve(workerDirectory, 'node_modules/.bin/wrangler'), workerDirectory),
  { wait, log: console.log },
)

async function main() {
  const response = await fetch('https://skilld.dev/api/v1/trusted-roots/skilld-root-2026-11')
  if (!response.ok)
    throw new Error(`Trusted root preflight returned HTTP ${response.status}.`)
  const root = parseRootConfig(await response.json())
  const config = unstable_readConfig({ config: resolve(workerDirectory, 'wrangler.jsonc') })
  return await deployArtifactSigner({
    vars: config.vars,
    secrets: process.env,
    root,
    now: Math.floor(Date.now() / 1000),
    command: deploy,
  })
}

main()
  .then((result) => {
    if (result._tag === 'failed')
      process.exitCode = result.exitCode
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  })
