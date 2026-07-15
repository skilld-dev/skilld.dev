import type { Platform } from '#shared/server/platform'
import { getTaskEnv } from '#shared/server/task-env'

// SWR background refreshes and some internal $fetch contexts arrive with
// event.context.cloudflare unset, which would skip platform attachment and
// surface as 500s in defineApiHandler. Nitro exposes the current Worker env on
// globalThis.__env__, so context-less requests can resolve it without retaining
// the first request's env across later binding-only deployments.

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const env = getTaskEnv(event.context)
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
