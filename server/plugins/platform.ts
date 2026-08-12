import type { Platform } from '#shared/server/platform'
import { resolveCloudflareBindings, setCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { withD1ResetRecovery } from '@harlan-zw/nuxt-cloudflare/d1'

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

    const db = withD1ResetRecovery(env.DB) as unknown as D1Database
    const retryingEnv = new Proxy(env, {
      get(target, property) {
        return property === 'DB' ? db : Reflect.get(target, property, target)
      },
    })
    // db0's Cloudflare connector, used by Nuxt Content, reads the binding from
    // this Nitro-managed global instead of the request context.
    setCloudflareBindings(retryingEnv)

    const platform: Platform = {
      db,
      ai: env.AI,
      SKILLD_ANALYTICS: env.SKILLD_ANALYTICS,
      env: retryingEnv,
      requestId: crypto.randomUUID(),
    }
    event.context.platform = platform
  })
})
