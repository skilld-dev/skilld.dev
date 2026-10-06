import type { RepoMeta } from './github-client'
import { z } from 'zod'
import { GITHUB_PAGE_READ_TIMEOUT_MS } from './github-client'

const unghRepoSchema = z.object({
  repo: z.object({
    name: z.string().min(1),
    repo: z.string().regex(/^[^/]+\/[^/]+$/),
    description: z.string().nullable().optional(),
    createdAt: z.string(),
    pushedAt: z.string(),
    stars: z.number().int().nonnegative(),
    forks: z.number().int().nonnegative(),
    defaultBranch: z.string().min(1),
  }),
})

export type UnghRepoResult
  = | { _tag: 'found', meta: RepoMeta }
    | { _tag: 'unavailable', reason: string }

/**
 * Public repository metadata from ungh.cc, the unjs GitHub proxy that caches
 * anonymous reads.
 *
 * A page-view fallback for when `GITHUB_TOKEN` is spent or GitHub is down. It
 * answers metadata only. It never serves a tree or file content, and nothing
 * built or signed reads it. ungh.cc knows no archived or fork flag, so both
 * read false. Its 404 is no verdict about GitHub, so it reads as unavailable.
 */
export async function readUnghRepoMeta(
  owner: string,
  repo: string,
  fetcher: typeof fetch = fetch,
): Promise<UnghRepoResult> {
  const response = await fetcher(`https://ungh.cc/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: { 'User-Agent': 'skilld.dev', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(GITHUB_PAGE_READ_TIMEOUT_MS),
  }).catch((error: unknown) => ({ _tag: 'threw' as const, reason: error instanceof Error ? error.message : String(error) }))
  if ('_tag' in response)
    return { _tag: 'unavailable', reason: response.reason }
  if (!response.ok) {
    await response.body?.cancel()
    return { _tag: 'unavailable', reason: `ungh ${response.status}` }
  }
  const parsed = unghRepoSchema.safeParse(await response.json().catch(() => {
    // A body that is not JSON fails the schema below, which reports it.
    return null
  }))
  if (!parsed.success)
    return { _tag: 'unavailable', reason: 'ungh invalid response' }
  const { repo: found } = parsed.data
  const [login] = found.repo.split('/') as [string, string]
  return {
    _tag: 'found',
    meta: {
      name: found.name,
      full_name: found.repo,
      html_url: `https://github.com/${found.repo}`,
      owner: { login },
      default_branch: found.defaultBranch,
      description: found.description ?? null,
      stargazers_count: found.stars,
      forks_count: found.forks,
      pushed_at: found.pushedAt,
      created_at: found.createdAt,
      archived: false,
      fork: false,
      private: false,
    },
  }
}
