import { consumeRegistryJobBatch } from '../utils/registry-jobs-runtime'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:queue', async ({ batch, env }) => {
    await consumeRegistryJobBatch(env as Cloudflare.Env & Record<string, unknown>, batch)
  })
})
