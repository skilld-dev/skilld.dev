import type { SkillAlias } from '../utils/skill-aliases'
import { repositoryPathSegments } from '../utils/repository-aliases'
import { indexSkillAliases, loadSkillAliases, resolveRenamedSkillRoute } from '../utils/skill-aliases'

const ISOLATE_TTL_MS = 60_000
const isolateCache = new WeakMap<object, { indexed: ReadonlyMap<string, SkillAlias>, expiresAt: number }>()

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

  const storage = useStorage('cache')
  const now = Date.now()
  let entry = isolateCache.get(storage)
  if (!entry || entry.expiresAt <= now) {
    const aliases = await loadSkillAliases(storage, db)
    if (!aliases)
      return
    entry = { indexed: indexSkillAliases(aliases), expiresAt: now + ISOLATE_TTL_MS }
    isolateCache.set(storage, entry)
  }

  if (!entry.indexed.size)
    return

  const decision = resolveRenamedSkillRoute(url.pathname, url.search, entry.indexed)
  if (decision._tag === 'redirect')
    return sendRedirect(event, decision.location, 301)
})
