/**
 * Which skills the trending board is currently carrying, as a lookup the
 * catalog can ask.
 *
 * CASE IS THE WHOLE REASON THIS IS NOT AN INLINE TEMPLATE STRING. The two
 * sides disagree. Social evidence arrives through `extractRepoReferences`,
 * which lowercases every owner and repo segment it parses out of a URL, so the
 * feed calls the repository `lukeberrypi/skills`. GitHub calls it
 * `LukeberryPi/skills`, and that is what the catalog stores. A `===` between
 * the two silently marks nothing as trending, and silently is the problem: the
 * page still renders, just without a single flame on it.
 */

export interface TrendingKeyed {
  owner: string
  repo: string
  name: string
}

/** One skill's identity, folded to a single case so either side can ask. */
export function trendingSkillKey(owner: string, repo: string, name: string): string {
  return `${owner}/${repo}/${name}`.toLowerCase()
}

export function trendingSkillKeySet(items: readonly TrendingKeyed[]): Set<string> {
  return new Set(items.map(item => trendingSkillKey(item.owner, item.repo, item.name)))
}
