export interface SkillIdentity {
  owner: string
  repo: string
  name: string
}

/** A repository URL can name one Skill when its resolved count is one. */
export function repositoryIdentityFromGhPath(pathname: string): { owner: string, repo: string } | null {
  if (!pathname.startsWith('/gh/'))
    return null
  const segments = pathname.slice('/gh/'.length).replace(/\/+$/, '').split('/')
  if (segments.length !== 2 || segments.some(segment => !segment))
    return null
  const [owner, repo] = segments as [string, string]
  return { owner, repo }
}

/**
 * The skill a `/gh` path addresses, or null when the path is not one skill.
 *
 * Repository paths need a resolved Skill count before they can name one Skill.
 * Four or more segments are a sub-resource.
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
