import { consumeRegistryJobBatch } from '../utils/registry-jobs-runtime'

const REGISTRY_QUEUE_NAMES = new Set([
  'skilld-repo-sync',
  'skilld-repo-review-sync',
  'skilld-repo-sync-dlq',
])

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:queue', async ({ batch, env }) => {
    if (!REGISTRY_QUEUE_NAMES.has(batch.queue))
      return
    await consumeRegistryJobBatch(env as Cloudflare.Env & Record<string, unknown>, batch)
  })
})
