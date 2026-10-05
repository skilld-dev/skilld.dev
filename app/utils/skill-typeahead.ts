/** `[name, owner, repo, stars, registryPath]`, matching the API payload. */
export type TypeaheadTuple = [string, string, string, number, string]

export interface TypeaheadHit {
  name: string
  owner: string
  repo: string
  stars: number
  registryPath: string
}

/**
 * Match tiers, best first. Deliberately coarse: this index only knows
 * identifiers, so it should be confident about exact and prefix matches and
 * leave everything subtler to the server.
 */
const EXACT_NAME = 0
const NAME_PREFIX = 1
const OWNER_PREFIX = 2
const NAME_CONTAINS = 3
const PATH_CONTAINS = 4
const NO_MATCH = 5

function tierFor(name: string, owner: string, repo: string, query: string): number {
  if (name === query)
    return EXACT_NAME
  if (name.startsWith(query))
    return NAME_PREFIX
  if (owner.startsWith(query))
    return OWNER_PREFIX
  if (name.includes(query))
    return NAME_CONTAINS
  if (owner.includes(query) || repo.includes(query))
    return PATH_CONTAINS
  return NO_MATCH
}

/**
 * Prefix-match the local skill index.
 *
 * Answers the first keystroke with no network round trip. Results are a
 * placeholder for the real hybrid search, not a replacement: identifier
 * matching cannot serve a task-shaped query, so an empty result here means
 * "nothing obvious yet", never "nothing exists".
 */
export function matchTypeahead(
  index: readonly TypeaheadTuple[],
  rawQuery: string,
  limit = 6,
): TypeaheadHit[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query)
    return []

  const scored: { hit: TypeaheadHit, tier: number }[] = []
  for (const [name, owner, repo, stars, registryPath] of index) {
    const tier = tierFor(name.toLowerCase(), owner.toLowerCase(), repo.toLowerCase(), query)
    if (tier === NO_MATCH)
      continue
    scored.push({ hit: { name, owner, repo, stars, registryPath }, tier })
  }

  return scored
    .sort((a, b) =>
      a.tier - b.tier
      || b.hit.stars - a.hit.stars
      || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit)
    .map(entry => entry.hit)
}

/** A Repository the local index holds, with how many of its Skills it lists. */
export interface TypeaheadRepository {
  owner: string
  repo: string
  stars: number
  skillCount: number
  registryPath: string
}

const REPOSITORY_EXACT = 0
const REPOSITORY_PREFIX = 1
const REPOSITORY_OWNER_EXACT = 2
const REPOSITORY_OWNER_PREFIX = 3

function repositoryTier(owner: string, repo: string, query: string): number | null {
  if (repo === query)
    return REPOSITORY_EXACT
  if (repo.startsWith(query))
    return REPOSITORY_PREFIX
  if (owner === query)
    return REPOSITORY_OWNER_EXACT
  if (owner.startsWith(query))
    return REPOSITORY_OWNER_PREFIX
  return null
}

/**
 * Repositories whose name or owner starts with the query, from the same local
 * index. This is how "nuxt" or "antfu" finds a Repository with no network
 * call: the index already lists every discoverable Skill with its repo.
 *
 * Prefix only, and at least two characters, because a Repository row outranks
 * the Skills under it and a loose match there would bury them.
 */
export function matchTypeaheadRepositories(
  index: readonly TypeaheadTuple[],
  rawQuery: string,
  limit = 2,
): TypeaheadRepository[] {
  const query = rawQuery.trim().toLowerCase()
  if (query.length < 2)
    return []

  const byRepository = new Map<string, { repository: TypeaheadRepository, tier: number }>()
  for (const [, owner, repo, stars] of index) {
    const key = `${owner}/${repo}`
    const known = byRepository.get(key)
    if (known) {
      known.repository.skillCount++
      continue
    }
    const tier = repositoryTier(owner.toLowerCase(), repo.toLowerCase(), query)
    if (tier === null)
      continue
    byRepository.set(key, {
      tier,
      repository: { owner, repo, stars, skillCount: 1, registryPath: `/gh/${owner}/${repo}` },
    })
  }

  return [...byRepository.values()]
    .sort((a, b) =>
      a.tier - b.tier
      || b.repository.stars - a.repository.stars
      || b.repository.skillCount - a.repository.skillCount
      || `${a.repository.owner}/${a.repository.repo}`.localeCompare(`${b.repository.owner}/${b.repository.repo}`))
    .slice(0, limit)
    .map(entry => entry.repository)
}
