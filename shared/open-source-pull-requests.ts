import { z } from 'zod'

/**
 * Recently merged pull requests from skilld's public repositories, for the
 * Independent and open source reason. Pure: the route fetches each
 * repository's closed pulls, and this module parses and merges them.
 */

/** The public repositories the reason links. Both are MIT on GitHub. */
export const OPEN_SOURCE_REPOSITORIES = [
  { fullName: 'skilld-dev/skilld', label: 'CLI' },
  { fullName: 'skilld-dev/skilld.dev', label: 'site' },
] as const

export type OpenSourceRepository = typeof OPEN_SOURCE_REPOSITORIES[number]['fullName']

export interface RecentPullRequest {
  repository: OpenSourceRepository
  number: number
  /** The title without its Conventional Commits prefix, such as `feat(home): `. */
  title: string
  url: string
  /** Epoch seconds. */
  mergedAt: number
  author: string
  avatarUrl: string | null
}

export interface RecentPullRequestsResponse {
  items: RecentPullRequest[]
}

/** Only the fields we read from `GET /repos/{owner}/{repo}/pulls`. */
const GithubPullSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  html_url: z.string().url(),
  merged_at: z.string().nullable(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string().url().nullable().optional(),
    type: z.string().optional(),
  }).nullable(),
})

const GithubPullsSchema = z.array(GithubPullSchema)

const CONVENTIONAL_PREFIX = /^[a-z]+(?:\([^)]*\))?!?:\s*/i

/**
 * Merged, human-authored pulls from every repository, newest first.
 *
 * A pull that closed without merging never shipped, and a bot's dependency
 * bump says nothing about who builds skilld, so both stay out. Input that
 * fails to parse is skipped per repository, never guessed at.
 */
export function recentMergedPullRequests(
  pullsByRepository: ReadonlyArray<{ repository: OpenSourceRepository, pulls: unknown }>,
  limit: number,
): RecentPullRequest[] {
  return pullsByRepository
    .flatMap(({ repository, pulls }) => {
      const parsed = GithubPullsSchema.safeParse(pulls)
      if (!parsed.success)
        return []
      return parsed.data.flatMap((pull): RecentPullRequest[] => {
        if (!pull.merged_at || !pull.user || pull.user.type === 'Bot')
          return []
        const mergedAt = Math.floor(Date.parse(pull.merged_at) / 1000)
        if (!Number.isFinite(mergedAt))
          return []
        return [{
          repository,
          number: pull.number,
          title: pull.title.replace(CONVENTIONAL_PREFIX, '') || pull.title,
          url: pull.html_url,
          mergedAt,
          author: pull.user.login,
          avatarUrl: pull.user.avatar_url ?? null,
        }]
      })
    })
    .sort((a, b) => b.mergedAt - a.mergedAt)
    .slice(0, limit)
}
