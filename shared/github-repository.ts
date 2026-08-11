const GITHUB_HOSTS = new Set(['github.com', 'www.github.com'])
const REPOSITORY_SEGMENT_RE = /^[\w.-]+$/
const REPOSITORY_PATH_KINDS = new Set(['blob', 'tree'])

export interface GitHubRepository {
  _tag: 'repository'
  owner: string
  repo: string
  url: string
}

export type GitHubRepositoryParseResult
  = | GitHubRepository
    | { _tag: 'not_repository' }

export function parseGitHubRepositoryUrl(input: string): GitHubRepositoryParseResult {
  if (!/^https?:\/\//i.test(input.trim()))
    return { _tag: 'not_repository' }

  if (!URL.canParse(input.trim()))
    return { _tag: 'not_repository' }
  const parsed = new URL(input.trim())
  if (!GITHUB_HOSTS.has(parsed.hostname.toLowerCase()))
    return { _tag: 'not_repository' }

  const segments = parsed.pathname.split('/').filter(Boolean)
  const owner = segments[0]?.toLowerCase()
  const repo = segments[1]?.replace(/\.git$/i, '').toLowerCase()
  const pathKind = segments[2]?.toLowerCase()
  if (
    !owner
    || !repo
    || !REPOSITORY_SEGMENT_RE.test(owner)
    || !REPOSITORY_SEGMENT_RE.test(repo)
    || owner.length > 100
    || repo.length > 100
    || (pathKind && !REPOSITORY_PATH_KINDS.has(pathKind))
  ) {
    return { _tag: 'not_repository' }
  }

  return {
    _tag: 'repository',
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  }
}
