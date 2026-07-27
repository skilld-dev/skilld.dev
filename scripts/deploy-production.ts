import type { ProductionCommand, ProductionCommandResult } from './lib/production-deploy'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { runProductionDeployment } from './lib/production-deploy'
import { runProductionSmoke } from './lib/production-smoke'

function createCommand(executable: string): ProductionCommand {
  return args => new Promise<ProductionCommandResult>((resolvePromise, rejectPromise) => {
    console.log(`$ wrangler ${args.join(' ')}`)
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      const value = chunk.toString()
      stdout += value
      process.stdout.write(value)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const value = chunk.toString()
      stderr += value
      process.stderr.write(value)
    })
    child.on('error', rejectPromise)
    child.on('close', (exitCode) => {
      resolvePromise(exitCode === 0
        ? { _tag: 'passed', stdout, stderr }
        : { _tag: 'failed', stdout, stderr, exitCode: exitCode ?? 1 })
    })
  })
}

async function main(): Promise<void> {
  const result = await runProductionDeployment({
    command: createCommand(resolve(process.cwd(), 'node_modules/.bin/wrangler')),
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
