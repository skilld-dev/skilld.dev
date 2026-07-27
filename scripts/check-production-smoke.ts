import { runProductionSmoke } from './lib/production-smoke'

async function main(): Promise<void> {
  const result = await runProductionSmoke({
    baseUrl: process.env.PRODUCTION_SMOKE_BASE_URL ?? 'https://skilld.dev',
  })
  if (result._tag === 'failed') {
    console.error(JSON.stringify(result, null, 2))
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
