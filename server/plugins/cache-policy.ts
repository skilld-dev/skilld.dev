import { definePlugin } from 'nitro'

/**
 * The fail-closed floor for responses no route rule covers.
 *
 * Workers Cache treats a headerless 200 as cacheable for two hours, so every
 * response needs a policy. Nitro applies route rules after the handler, so
 * they can supply public lifetimes. A wildcard Vary still forbids storage.
 *
 * Set the floor before rendering so error pages inherit it. Reapply it to
 * wildcard responses after route headers have been merged.
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks?.hook('request', (event) => {
    event.res.headers.set('cache-control', 'private, no-store')
    event.res.headers.set('cloudflare-cdn-cache-control', 'private, no-store')
  })
  nitroApp.hooks?.hook('response', (response, event) => {
    if (!event.context.hubRenderFailed && response.headers.get('vary') !== '*')
      return

    response.headers.set('vary', '*')
    response.headers.set('cache-control', 'private, no-store')
    response.headers.set('cloudflare-cdn-cache-control', 'no-store')
  })
})
