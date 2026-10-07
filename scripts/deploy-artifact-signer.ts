// The Artifact signer has no smoke of its own: the site deploy and the
// Artifact build smoke that follow it in the workflow exercise it.
import { resolve } from 'node:path'
import { withTransientRetry } from './lib/cloudflare-retry'
import { createCommand, wait } from './lib/spawn-command'

const workerDirectory = resolve(process.cwd(), 'workers/artifact-signer')
const deploy = withTransientRetry(
  createCommand(resolve(workerDirectory, 'node_modules/.bin/wrangler'), workerDirectory),
  { wait, log: console.log },
)

deploy(['deploy', '--config', 'wrangler.jsonc'])
  .then((result) => {
    if (result._tag === 'failed')
      process.exitCode = result.exitCode
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  })
