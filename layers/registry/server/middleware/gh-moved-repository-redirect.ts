import {
  indexRepositoryAliases,
  loadRepositoryAliases,
  repositoryPathSegments,
  resolveMovedRepositoryRoute,
} from '../utils/repository-aliases'

/**
 * Answer every URL under a moved Repository with a 301 to its new name, so
 * the old URLs pass their link equity on (ADR-0015). Paths without an owner
 * and a Repository segment skip the cache read.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!repositoryPathSegments(url.pathname))
    return

  const db = event.context.platform?.db
  if (!db)
    return

  const aliases = await loadRepositoryAliases(useStorage('cache'), db)
  if (!aliases?.length)
    return

  const decision = resolveMovedRepositoryRoute(url.pathname, url.search, indexRepositoryAliases(aliases))
  if (decision._tag === 'redirect')
    return sendRedirect(event, decision.location, 301)
})
