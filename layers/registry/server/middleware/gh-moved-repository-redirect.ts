import type { RepositoryAlias } from '../utils/repository-aliases'
import {
  indexRepositoryAliases,
  loadRepositoryAliases,
  repositoryPathSegments,
  resolveMovedRepositoryRoute,
} from '../utils/repository-aliases'

const ISOLATE_TTL_MS = 60_000
const isolateCache = new WeakMap<object, { indexed: ReadonlyMap<string, RepositoryAlias>, expiresAt: number }>()

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

  const storage = useStorage('cache')
  const now = Date.now()
  let entry = isolateCache.get(storage)
  if (!entry || entry.expiresAt <= now) {
    const aliases = await loadRepositoryAliases(storage, db)
    if (!aliases)
      return
    entry = { indexed: indexRepositoryAliases(aliases), expiresAt: now + ISOLATE_TTL_MS }
    isolateCache.set(storage, entry)
  }

  if (!entry.indexed.size)
    return

  const decision = resolveMovedRepositoryRoute(url.pathname, url.search, entry.indexed)
  if (decision._tag === 'redirect')
    return sendRedirect(event, decision.location, 301)
})
