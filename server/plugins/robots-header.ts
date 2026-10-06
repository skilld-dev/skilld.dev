import { setResponseHeader } from 'h3'
import { robotsFromHtml } from '#shared/robots-meta'

/**
 * Make `X-Robots-Tag` repeat the robots meta tag the page rendered.
 *
 * See `shared/robots-meta.ts` for why the header must not decide on its own.
 * A response with no robots meta tag keeps whatever header it already has.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const directive = robotsFromHtml(html.head.join(''))
    if (directive)
      setResponseHeader(event, 'x-robots-tag', directive)
  })

  nitroApp.hooks.hook('render:response', (response, { event }) => {
    if (typeof response.body !== 'string')
      return
    const directive = robotsFromHtml(response.body)
    if (directive) {
      if (response.headers)
        response.headers['x-robots-tag'] = directive
      setResponseHeader(event, 'x-robots-tag', directive)
    }
  })
})
