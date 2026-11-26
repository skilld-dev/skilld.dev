import { resolveGhRoute } from '../utils/gh-route-policy'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const decision = resolveGhRoute(url.pathname, url.search)
  if (decision._tag === 'pass')
    return
  if (decision._tag === 'redirect')
    return sendRedirect(event, decision.location, 301)

  // Answer without the Nuxt error page. Throwing here would server-render the
  // full error layout, which is the cost this branch exists to avoid.
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
      'cloudflare-cdn-cache-control': 'public, max-age=300',
    },
  })
})
