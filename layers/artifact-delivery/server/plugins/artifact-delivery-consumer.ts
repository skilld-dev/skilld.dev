import { consumeArtifactBuildBatch } from '../utils/queue'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:queue', async ({ batch, env }) => {
    await consumeArtifactBuildBatch(env as Cloudflare.Env, batch)
  })
})
