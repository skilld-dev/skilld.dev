import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  parseRegistryConvergence,
  REGISTRY_CONVERGENCE_SQL,
  registryConvergenceSummary,
} from './lib/registry-convergence'

const execFileAsync = promisify(execFile)

async function main(): Promise<void> {
  const wranglerPath = resolve('node_modules/.bin/wrangler')
  const { stdout } = await execFileAsync(wranglerPath, [
    'd1',
    'execute',
    'DB',
    '--remote',
    '--command',
    REGISTRY_CONVERGENCE_SQL,
    '--json',
  ])
  const parsed = parseRegistryConvergence(stdout)
  if (parsed._tag === 'error') {
    console.error(JSON.stringify(parsed))
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({
    ...parsed,
    summary: registryConvergenceSummary(parsed.snapshot),
  }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
