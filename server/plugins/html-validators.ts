import { getRequestHeader, getResponseHeader, setResponseHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
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
    const header = (value: string | number | string[] | undefined): string | null =>
      value === undefined ? null : Array.isArray(value) ? value.join(', ') : String(value)
    const decision = await decideHtmlValidators({
      buildId: useRuntimeConfig().app.buildId,
      method: event.method,
      status: response.statusCode ?? 200,
      body: response.body,
      request: { get: name => header(getRequestHeader(event, name)) },
      response: { get: name => header(getResponseHeader(event, name)) },
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
