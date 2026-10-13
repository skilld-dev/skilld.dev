import { repositoryPathSegments } from '../utils/repository-aliases'
import { indexSkillAliases, loadSkillAliases, resolveRenamedSkillRoute } from '../utils/skill-aliases'

/**
 * Answer every URL under a renamed Skill with a 301 to its new name, so the
 * old URLs pass their link equity on (ADR-0017). Paths without a Skill
 * segment skip the cache read.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!repositoryPathSegments(url.pathname)?.rest.length)
    return

  const db = event.context.platform?.db
  if (!db)
    return

  const aliases = await loadSkillAliases(useStorage('cache'), db)
  if (!aliases?.length)
    return

  const decision = resolveRenamedSkillRoute(url.pathname, url.search, indexSkillAliases(aliases))
  if (decision._tag === 'redirect')
    return sendRedirect(event, decision.location, 301)
})
