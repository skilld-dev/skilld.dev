import type { GitHubRepository } from './github-repository'
import { parseGitHubRepositoryUrl } from './github-repository'

/** The longest query the search box sends. Longer input is cut, never rejected. */
export const MAX_SEARCH_QUERY_LENGTH = 200

const WHITESPACE_RE = /\s+/g
const TRAILING_PUNCTUATION_RE = /[?!.,;:]+$/
const GITHUB_HOST_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i
const GITHUB_SEGMENT_RE = /^[\w.-]+$/
// GitHub logins: letters, digits and single hyphens, up to 39 characters.
const GITHUB_LOGIN_RE = /^[a-z\d][a-z\d-]{0,38}$/i

/**
 * What the search box was given, decided before any network call.
 *
 * Only `intent` may reach the query model. A URL, a ref, a login, or a single
 * word is already a precise query, so a model could only make it worse and
 * slower.
 */
export type SkillSearchQuery
  = | { _tag: 'empty' }
    | { _tag: 'repository', repository: GitHubRepository, source: 'url' | 'ref' }
    | { _tag: 'skill', owner: string, repo: string, name: string }
    | { _tag: 'owner', login: string }
    | { _tag: 'name', text: string }
    | { _tag: 'intent', text: string }

/**
 * One spelling per query: the cache key, the model input, and the identity the
 * classifier reads. "Review my PRs?" and "review my prs" are the same search.
 */
export function normalizeSearchQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(WHITESPACE_RE, ' ')
    .trim()
    .toLowerCase()
    .slice(0, MAX_SEARCH_QUERY_LENGTH)
    .replace(TRAILING_PUNCTUATION_RE, '')
    .trim()
}

function repositoryRef(owner: string, repo: string): GitHubRepository {
  const o = owner.toLowerCase()
  const r = repo.replace(/\.git$/i, '').toLowerCase()
  return { _tag: 'repository', owner: o, repo: r, url: `https://github.com/${o}/${r}` }
}

function classifyGitHubUrl(text: string): SkillSearchQuery | null {
  if (!GITHUB_HOST_RE.test(text))
    return null
  const url = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const parsed = parseGitHubRepositoryUrl(url)
  if (parsed._tag === 'repository')
    return { _tag: 'repository', repository: parsed, source: 'url' }
  // `github.com/antfu` names an owner, not a repository.
  const segments = text.replace(GITHUB_HOST_RE, '').split('/').filter(Boolean)
  if (segments.length === 1 && GITHUB_LOGIN_RE.test(segments[0]!))
    return { _tag: 'owner', login: segments[0]!.toLowerCase() }
  return null
}

/** Classify one search box value. Pure, so the browser and the server agree. */
export function classifySearchQuery(raw: string): SkillSearchQuery {
  const text = normalizeSearchQuery(raw)
  if (!text)
    return { _tag: 'empty' }

  const url = classifyGitHubUrl(text)
  if (url)
    return url

  if (text.startsWith('@')) {
    const login = text.slice(1)
    if (GITHUB_LOGIN_RE.test(login))
      return { _tag: 'owner', login }
  }

  if (!text.includes(' ') && text.includes('/')) {
    const segments = text.split('/')
    if (segments.every(segment => GITHUB_SEGMENT_RE.test(segment))) {
      if (segments.length === 2)
        return { _tag: 'repository', repository: repositoryRef(segments[0]!, segments[1]!), source: 'ref' }
      return { _tag: 'skill', owner: segments[0]!, repo: segments[1]!, name: segments.slice(2).join('/') }
    }
  }

  return text.includes(' ') ? { _tag: 'intent', text } : { _tag: 'name', text }
}
