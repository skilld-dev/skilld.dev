export interface SkillIdentity {
  owner: string
  repo: string
  name: string
}

/**
 * The skill a `/gh` path addresses, or null when the path is not one skill.
 *
 * Two segments are a repository hub and four or more are a sub-resource, so
 * neither has a single SKILL.md to answer with.
 */
export function skillIdentityFromGhPath(pathname: string): SkillIdentity | null {
  if (!pathname.startsWith('/gh/'))
    return null
  const segments = pathname.slice('/gh/'.length).replace(/\/+$/, '').split('/')
  if (segments.length !== 3 || segments.some(segment => !segment))
    return null
  const [owner, repo, name] = segments as [string, string, string]
  return { owner, repo, name }
}
