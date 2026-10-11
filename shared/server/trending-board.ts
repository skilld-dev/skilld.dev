/**
 * The data behind `/skills/trending` for the `week` and `month` ranges.
 *
 * Kept apart from the feed handler so the page and the SEO admission job read
 * the same board. A Skill that "appears on the trending list" means one thing:
 * it is in `namedSkills` or `fallback` here. A second reading of the list would
 * let the two drift.
 */

import type { FallbackSkill } from '#shared/server/trending-fallback'
import type { TrendingRepo } from '#shared/server/trending-repos'
import type { TrendingSkill } from '#shared/server/trending-skills'
import { loadFallbackSkills } from '#shared/server/trending-fallback'
import {
  DEFAULT_MAX_REPOS_PER_POST,
  DEFAULT_MIN_LIKES,
  loadTopStarredRepositories,
  loadTrendingRepos,
} from '#shared/server/trending-repos'
import { loadTrendingSkills } from '#shared/server/trending-skills'
import { DEMOTED_STARRED_REPOSITORIES } from '#shared/trending-range'

/**
 * Top up from GitHub stars when the socials have been quiet. Below this many
 * named skills the page reads as broken, and at fewer than eight it excludes
 * itself from the index, so filler is better than an empty shelf.
 *
 * Counted on the collection the page renders. It once keyed off the
 * repositories band, which the page no longer shows, so filler was decided by a
 * number no reader could see.
 */
export const MIN_BEFORE_FALLBACK = 8

export interface TrendingBoard {
  entries: TrendingRepo[]
  namedSkills: TrendingSkill[]
  fallback: FallbackSkill[]
}

export interface LoadTrendingBoardOptions {
  db: D1Database
  /** Unix seconds. */
  now: number
  limit: number
  windowHours: number
}

/** The named rows used by both the public board and its awards. */
export async function loadTrendingBoardSkills(
  options: LoadTrendingBoardOptions,
  deprioritizeRepositories?: ReadonlySet<string>,
): Promise<TrendingSkill[]> {
  const demoted = deprioritizeRepositories
    ?? await loadTopStarredRepositories(options.db, DEMOTED_STARRED_REPOSITORIES)
  return loadTrendingSkills({ ...options, deprioritizeRepositories: demoted })
}

export async function loadTrendingBoard(options: LoadTrendingBoardOptions): Promise<TrendingBoard> {
  const { db, now, limit } = options
  // The page header states this demotion, so it reads the same constant.
  const deprioritizeRepositories = await loadTopStarredRepositories(db, DEMOTED_STARRED_REPOSITORIES)
  const [entries, namedSkills] = await Promise.all([
    loadTrendingRepos({
      db,
      now,
      limit,
      indexedOnly: true,
      minLikes: DEFAULT_MIN_LIKES,
      maxReposPerPost: DEFAULT_MAX_REPOS_PER_POST,
      deprioritizeRepositories,
    }),
    // Same `limit` the repository half gets. A hardcoded 12 here once made the
    // caller's `?limit=` a lie for the collection the page renders.
    loadTrendingBoardSkills(options, deprioritizeRepositories),
  ])

  const fallback = namedSkills.length >= MIN_BEFORE_FALLBACK
    ? []
    : await loadFallbackSkills({
        db,
        now,
        limit: MIN_BEFORE_FALLBACK - namedSkills.length,
        // Excluded by repository, not by skill. The filler query picks one
        // skill per repo with `MIN(name)`, so a repo already named for one
        // skill would otherwise return again under another: two rows, same
        // owner, same avatar, same star count.
        exclude: new Set([
          ...entries.map(entry => `${entry.owner}/${entry.repo}`),
          ...namedSkills.map(skill => `${skill.owner}/${skill.repo}`),
        ]),
        deprioritizeRepositories,
      })

  return { entries, namedSkills, fallback }
}
