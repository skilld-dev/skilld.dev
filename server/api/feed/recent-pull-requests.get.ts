/**
 * Recently merged pull requests from skilld's public repositories, for the
 * Independent and open source reason on the homepage and `/vs/skills-sh`.
 *
 * Two GitHub reads per refresh, cached for a day, so the feed spends about two
 * calls a day of the token the registry sync also uses. A failed read throws,
 * and the cache keeps serving the last good answer for a week.
 */

import type { OpenSourceRepository, RecentPullRequestsResponse } from '#shared/open-source-pull-requests'
import { cachedFeed } from '#server/utils/feed-cache'
import { OPEN_SOURCE_REPOSITORIES, recentMergedPullRequests } from '#shared/open-source-pull-requests'
import { defineApiHandler } from '#shared/server/handler'

/** Rows the pictures show at most. */
const LIMIT = 6

/** Pulls read per repository, enough to fill the rows after bots and unmerged pulls drop out. */
const PER_REPOSITORY = 20

async function fetchClosedPulls(repository: OpenSourceRepository, token: string | undefined): Promise<unknown> {
  return $fetch(`https://api.github.com/repos/${repository}/pulls`, {
    query: { state: 'closed', sort: 'updated', direction: 'desc', per_page: PER_REPOSITORY },
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skilld.dev (+https://skilld.dev)',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

export default defineApiHandler({
  handler: ({ event, platform }): Promise<RecentPullRequestsResponse> => cachedFeed(event, 'recent-pull-requests', async () => {
    const token = platform.env.GITHUB_TOKEN?.trim() || undefined
    const pullsByRepository = await Promise.all(OPEN_SOURCE_REPOSITORIES.map(async ({ fullName }) => ({
      repository: fullName,
      pulls: await fetchClosedPulls(fullName, token),
    })))
    return { items: recentMergedPullRequests(pullsByRepository, LIMIT) }
  }, [], { ttl: 86_400, staleTtl: 604_800 }),
})
