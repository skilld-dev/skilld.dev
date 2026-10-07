import { resolve } from 'node:path'
import { withTransientRetry } from './lib/cloudflare-retry'
import { runProductionDeployment } from './lib/production-deploy'
import { runProductionSmoke } from './lib/production-smoke'
import { createCommand, wait } from './lib/spawn-command'

async function main(): Promise<void> {
  const result = await runProductionDeployment({
    command: withTransientRetry(createCommand(resolve(process.cwd(), 'node_modules/.bin/wrangler')), { wait, log: console.log }),
    smoke: () => runProductionSmoke({
      baseUrl: process.env.PRODUCTION_SMOKE_BASE_URL ?? 'https://skilld.dev',
    }),
    releaseSha: process.env.GITHUB_SHA ?? 'unknown-release',
  })
  console.log(JSON.stringify(result, null, 2))
  if (result._tag !== 'deployed')
    process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
