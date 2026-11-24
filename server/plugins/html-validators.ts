import { getRequestHeader, getResponseHeader, setResponseHeader } from 'h3'
import { getRouteRules, useRuntimeConfig } from 'nuxt/server'
import { decideHtmlValidators } from '#shared/html-validators'

/**
 * Give an edge cached page an ETag, and answer a request that already holds
 * the page with an empty 304. `shared/html-validators.ts` decides both.
 *
 * The 304 keeps the route's cache headers, so a revalidating Workers Cache
 * entry stays fresh for the route's lifetime again.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', async (response, { event }) => {
    if (event.context.hubRenderFailed)
      return

    const header = (value: string | number | string[] | undefined): string | null =>
      value === undefined ? null : Array.isArray(value) ? value.join(', ') : String(value)
    // Nitro applies route headers after this render hook has decided whether to return a 304.
    const routeHeaders = new Headers(getRouteRules(event).headers || undefined)
    const decision = await decideHtmlValidators({
      buildId: useRuntimeConfig().app.buildId,
      method: event.method,
      status: response.statusCode ?? 200,
      body: response.body,
      request: { get: name => header(getRequestHeader(event, name)) },
      response: { get: name => routeHeaders.get(name) ?? header(getResponseHeader(event, name)) },
    })
    if (decision._tag === 'skip')
      return

    setResponseHeader(event, 'etag', decision.etag)
    if (decision._tag === 'not-modified') {
      response.statusCode = 304
      response.statusMessage = 'Not Modified'
      response.body = ''
    }
  })
})
