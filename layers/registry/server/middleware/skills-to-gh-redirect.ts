import { resolveSkillsRoute } from '../utils/skills-route-policy'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const decision = resolveSkillsRoute(url.pathname, url.search)
  if (decision._tag === 'pass')
    return
  if (decision._tag === 'not_found')
    throw createError({ statusCode: 404, statusMessage: 'Unknown outcome' })
  return sendRedirect(event, decision.location, 301)
})
