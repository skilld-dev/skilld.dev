/** `[name, owner, repo, stars]`, matching the /api/skills/typeahead payload. */
export type TypeaheadTuple = [string, string, string, number]

export interface TypeaheadHit {
  name: string
  owner: string
  repo: string
  stars: number
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
  for (const [name, owner, repo, stars] of index) {
    const tier = tierFor(name.toLowerCase(), owner.toLowerCase(), repo.toLowerCase(), query)
    if (tier === NO_MATCH)
      continue
    scored.push({ hit: { name, owner, repo, stars }, tier })
    // The index is star-ordered, so once a comfortable surplus of strong
    // matches exists, scanning the long tail cannot change the top `limit`.
    if (scored.length >= limit * 20)
      break
  }

  return scored
    .sort((a, b) =>
      a.tier - b.tier
      || b.hit.stars - a.hit.stars
      || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit)
    .map(entry => entry.hit)
}
