import type { OrgProfile } from '../../server/api/orgs/[owner].get'

type RepoSkill = OrgProfile['skills'][number]
type RepoInfo = OrgProfile['repos'][number]

/**
 * `useFetch<OrgProfile>` asserts its response type, so a partial body reaches the
 * page as a truthy object whose arrays are missing (Sentry SKILLD-E). Read them
 * defensively here rather than at each call site.
 */
export function selectRepoSkills(profile: OrgProfile | null | undefined, repo: string): RepoSkill[] {
  const wanted = repo.toLowerCase()
  const skills = profile?.skills
  if (!Array.isArray(skills))
    return []
  return skills
    .filter(skill => skill.repo?.toLowerCase() === wanted)
    .sort((a, b) => {
      const aTime = a.modifiedAt ?? a.pushedAt ?? 0
      const bTime = b.modifiedAt ?? b.pushedAt ?? 0
      if (bTime !== aTime)
        return bTime - aTime
      return (b.installs ?? 0) - (a.installs ?? 0)
    })
}

export function selectRepoInfo(profile: OrgProfile | null | undefined, repo: string): RepoInfo | null {
  const repos = profile?.repos
  if (!Array.isArray(repos))
    return null
  return repos.find(candidate => candidate.repo === repo) ?? null
}
