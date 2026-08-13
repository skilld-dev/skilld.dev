/**
 * Pull GitHub repo references out of an X post.
 *
 * Pure and dependency-free so it can be unit tested against real post payloads
 * without a network or a database. The ingest task is the only caller and it
 * trusts the output completely, so every rejection rule lives here.
 */

export interface RepoReference {
  owner: string
  repo: string
  /** 'link' = the post pointed at GitHub. 'skilld' = it pointed at our page. */
  matchKind: 'link' | 'skilld'
}

/**
 * First path segments on github.com that are site chrome, not accounts.
 * Without this list, `github.com/features/copilot` reads as the repo
 * `features/copilot` and the ledger fills with pages that will never resolve.
 */
const GITHUB_RESERVED_OWNERS = new Set([
  'about',
  'account',
  'apps',
  'blog',
  'business',
  'codespaces',
  'collections',
  'contact',
  'customer-stories',
  'dashboard',
  'enterprise',
  'events',
  'explore',
  'features',
  'git-lfs',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'nonprofit',
  'notifications',
  'organizations',
  'orgs',
  'personal',
  'premium-support',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'settings',
  'shop',
  'signup',
  'site',
  'sponsors',
  'stars',
  'team',
  'topics',
  'trending',
  'users',
  'watching',
])

/**
 * Second path segments that mean "a page about the owner", not a repo name.
 * `github.com/anthropics/repositories` is the owner's repo list.
 */
const GITHUB_RESERVED_REPOS = new Set([
  'followers',
  'following',
  'gists',
  'packages',
  'projects',
  'repositories',
  'sponsors',
  'stars',
])

const GITHUB_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
])

const SKILLD_HOSTS = new Set(['skilld.dev', 'www.skilld.dev'])

/** GitHub allows alphanumerics and hyphens in owners; repos also allow `._`. */
const OWNER_PATTERN = /^[\w.-]+$/
const REPO_PATTERN = /^[\w.-]+$/

function normalizeSegment(value: string): string {
  // Strip a `.git` suffix and any trailing punctuation an author typed
  // directly against the URL ("check out github.com/a/b.").
  return value.replace(/\.git$/i, '').replace(/[.,;:!?)\]}'"]+$/, '').toLowerCase()
}

function acceptRepo(rawOwner: string, rawRepo: string): { owner: string, repo: string } | null {
  const owner = normalizeSegment(rawOwner)
  const repo = normalizeSegment(rawRepo)
  if (!owner || !repo)
    return null
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo))
    return null
  if (GITHUB_RESERVED_OWNERS.has(owner) || GITHUB_RESERVED_REPOS.has(repo))
    return null
  // `.` and `..` would escape the path when the slug is used to build a URL.
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..')
    return null
  return { owner, repo }
}

function parseOne(rawUrl: string): RepoReference | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  }
  catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)

  if (GITHUB_HOSTS.has(host)) {
    // Both `github.com/<owner>/<repo>/...` and the raw-content host share the
    // leading `<owner>/<repo>` shape, so deep links to a SKILL.md inside a
    // repo resolve to the repo itself.
    if (segments.length < 2)
      return null
    const accepted = acceptRepo(segments[0]!, segments[1]!)
    return accepted ? { ...accepted, matchKind: 'link' } : null
  }

  if (SKILLD_HOSTS.has(host)) {
    // /gh/<owner>/<repo> and /skills/<owner>/<repo>/<name> both identify a repo.
    const [head, ...rest] = segments
    if ((head === 'gh' || head === 'skills') && rest.length >= 2) {
      const accepted = acceptRepo(rest[0]!, rest[1]!)
      return accepted ? { ...accepted, matchKind: 'skilld' } : null
    }
    return null
  }

  return null
}

/**
 * Bare `github.com/owner/repo` mentions typed without a scheme. X only builds
 * a URL entity when it recognises a link, and plenty of posts write the path
 * inline inside a code block or a thread body.
 */
const BARE_GITHUB_PATTERN = /(?:^|[\s(<[])(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/gi

export function extractRepoReferences(input: { urls: string[], text: string }): RepoReference[] {
  const found = new Map<string, RepoReference>()

  const add = (ref: RepoReference | null) => {
    if (!ref)
      return
    const key = `${ref.owner}/${ref.repo}`
    // A skilld link is the stronger signal: it means the poster found the repo
    // through us. Never let a later plain GitHub link downgrade it.
    const existing = found.get(key)
    if (!existing || (existing.matchKind === 'link' && ref.matchKind === 'skilld'))
      found.set(key, ref)
  }

  for (const url of input.urls)
    add(parseOne(url))

  for (const match of input.text.matchAll(BARE_GITHUB_PATTERN))
    add(parseOne(`https://github.com/${match[1]}/${match[2]}`))

  return [...found.values()]
}
