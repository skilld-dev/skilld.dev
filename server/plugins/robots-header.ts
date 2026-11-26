import { setResponseHeader } from 'h3'
import { robotsFromHtml } from '#shared/robots-meta'

/**
 * Make `X-Robots-Tag` repeat the robots meta tag the page rendered.
 *
 * See `shared/robots-meta.ts` for why the header must not decide on its own.
 * A response with no robots meta tag keeps whatever header it already has.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:page:markdown', ({ html, event }) => {
    if (!event)
      return
    const directive = robotsFromHtml(html)
    if (directive)
      setResponseHeader(event, 'x-robots-tag', directive)
  })

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const directive = robotsFromHtml(html.head.join(''))
    if (directive) {
      event.context._robotsHeaderDirective = directive
      setResponseHeader(event, 'x-robots-tag', directive)
    }
  })

  nitroApp.hooks.hook('render:response', (response, { event }) => {
    if (typeof response.body !== 'string')
      return
    // Reuse the directive already extracted from `html.head` in `render:html`
    // instead of regex-scanning the entire ~170 KB HTML response body twice.
    let directive = event.context._robotsHeaderDirective as string | undefined
    if (!directive) {
      const headEnd = response.body.indexOf('</head>')
      const headSlice = headEnd === -1 ? response.body : response.body.slice(0, headEnd)
      directive = robotsFromHtml(headSlice) ?? undefined
    }
    if (directive) {
      if (response.headers)
        response.headers['x-robots-tag'] = directive
      setResponseHeader(event, 'x-robots-tag', directive)
    }
  })
})
