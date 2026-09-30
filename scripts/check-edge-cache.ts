import { checkEdgeCache } from './lib/edge-cache-check'

/**
 * Prove the trending pages are cached at the edge and safe to cache.
 *
 *   pnpm production:edge-cache
 *   EDGE_CACHE_BASE_URL=https://skilld.dev pnpm production:edge-cache
 *
 * The deploy workflow runs it after `production:deploy`. It does not roll back:
 * the rollback smoke re-checks the previous version, and a version from before
 * the `edgeCache` rule could never pass it. Exit code 1 on any failure.
 */
async function main(): Promise<void> {
  const result = await checkEdgeCache({
    baseUrl: process.env.EDGE_CACHE_BASE_URL ?? 'https://skilld.dev',
  })
  console.log(JSON.stringify(result, null, 2))
  if (result._tag === 'failed')
    process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
