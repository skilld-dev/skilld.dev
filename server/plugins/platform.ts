import type { CloudflareEnv, Platform } from '#shared/server/platform'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const env = event.context.cloudflare?.env as CloudflareEnv | undefined
    if (!env)
      return

    const platform: Platform = {
      db: env.DB,
      ai: env.AI,
      SKILLD_ANALYTICS: env.SKILLD_ANALYTICS,
      env,
      requestId: crypto.randomUUID(),
    }
    event.context.platform = platform
  })
})
