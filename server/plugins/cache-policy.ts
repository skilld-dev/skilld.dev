/**
 * The fail-closed floor for responses no route rule covers.
 *
 * Workers Cache treats a headerless 200 as cacheable for two hours, so every
 * response needs a policy. This one runs before routing, so a route rule that
 * sets its own `cache-control` simply replaces it, and per-route freshness
 * lives in `nuxt.config.ts` where Nuxt already puts it.
 *
 * It has to be the `request` hook rather than `beforeResponse`. Nitro's error
 * renderer calls `send()` directly, which marks the event handled and skips
 * `beforeResponse` entirely, so a floor set there would never reach an error
 * page. This is the only hook an error response inherits.
 *
 * Temporary. `@harlan-zw/nuxt-cloudflare` is taking over this exact floor
 * (harlan-zw/harlan-nuxt#76). Delete this file once that ships.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    setResponseHeader(event, 'Cloudflare-CDN-Cache-Control', 'private, no-store')
  })
})
