import type { Platform } from '#shared/server/platform'
import { resolveCloudflareBindings, setCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { createPlatformD1 } from '../utils/db'

// SWR background refreshes and some internal $fetch contexts arrive with
// event.context.cloudflare unset, which would skip platform attachment and
// surface as 500s in defineApiHandler. Nitro exposes the current Worker env on
// globalThis.__env__, so context-less requests can resolve it without retaining
// the first request's env across later binding-only deployments.

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const env = resolveCloudflareBindings<Cloudflare.Env>(event.context)
    if (!env)
      return

    const d1 = createPlatformD1(env)
    // db0's Cloudflare connector reads the binding from
    // this Nitro-managed global instead of the request context.
    setCloudflareBindings(d1.bindings)

    const platform: Platform = {
      db: d1.database,
      ai: env.AI,
      SKILLD_ANALYTICS: env.SKILLD_ANALYTICS,
      env: d1.bindings,
      requestId: crypto.randomUUID(),
    }
    event.context.platform = platform
  })
})
