import { resolveOrgsRedirect } from '../utils/orgs-route-policy'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const decision = resolveOrgsRedirect(url.pathname, url.search)
  if (decision._tag === 'pass')
    return
  return sendRedirect(event, decision.location, 301)
})
