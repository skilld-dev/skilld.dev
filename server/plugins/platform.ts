import type { CloudflareEnv, Platform } from '#shared/server/platform'

// SWR background refreshes and some internal $fetch contexts arrive with
// event.context.cloudflare unset, which would skip platform attachment and
// surface as 500s in defineApiHandler. Cache env on first seeing it (env is
// the same instance for the worker isolate lifetime) so subsequent
// context-less events still get a working platform.
let cachedEnv: CloudflareEnv | undefined

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const env = (event.context.cloudflare?.env as CloudflareEnv | undefined) ?? cachedEnv
    if (!env)
      return
    if (!cachedEnv)
      cachedEnv = env

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
