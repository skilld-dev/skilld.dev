import {
  BROWSER_NO_STORE,
  EDGE_NO_STORE,
  formatEdgeCacheControl,
  resolveEdgeCachePolicy,
} from '#shared/server/cache-policy'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    // Establish the safe fallback before routing. Nitro's error renderer can
    // bypass beforeResponse, so errors must inherit no-store from here.
    setResponseHeader(event, 'Cache-Control', BROWSER_NO_STORE)
    setResponseHeader(event, 'Cloudflare-CDN-Cache-Control', EDGE_NO_STORE)
  })

  nitroApp.hooks.hook('beforeResponse', (event) => {
    const pathname = getRequestURL(event).pathname
    const policy = resolveEdgeCachePolicy(
      event.method,
      pathname,
      getResponseStatus(event),
    )

    // Raw markdown deliberately retains browser caching. Everything else is
    // revalidated through Cloudflare so there is only one shared freshness
    // policy to reason about.
    if (!policy?.preserveBrowserCache)
      setResponseHeader(event, 'Cache-Control', BROWSER_NO_STORE)

    // Workers Cache never stores Set-Cookie responses. Cacheable routes are
    // deliberately user-independent, so do not let an incidental anonymous
    // session cookie silently turn an allowlisted response into a BYPASS.
    if (policy)
      removeResponseHeader(event, 'Set-Cookie')

    // Cloudflare gets a final, higher-precedence policy here and strips this
    // header downstream.
    setResponseHeader(event, 'Cloudflare-CDN-Cache-Control', formatEdgeCacheControl(policy))
  })
})
