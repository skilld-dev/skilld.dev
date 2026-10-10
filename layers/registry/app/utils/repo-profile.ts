import type { OrgProfile } from '../../server/api/orgs/[owner].get'
import { resolveMissingRepoRedirect } from './missing-repo-recovery'

type ProfileSkill = Pick<OrgProfile['skills'][number], 'owner' | 'repo' | 'name' | 'registryPath' | 'slug' | 'displayName' | 'description'
  | 'stars' | 'likeCount' | 'modifiedAt' | 'pushedAt' | 'firstSeenAt'
  | 'authorName' | 'skillFileUrl' | 'dependencies'>

function profileSkill(skill: OrgProfile['skills'][number]): ProfileSkill {
  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    registryPath: skill.registryPath,
    slug: skill.slug,
    displayName: skill.displayName,
    description: skill.description,
    stars: skill.stars,
    likeCount: skill.likeCount,
    modifiedAt: skill.modifiedAt,
    pushedAt: skill.pushedAt,
    firstSeenAt: skill.firstSeenAt,
    authorName: skill.authorName,
    skillFileUrl: skill.skillFileUrl,
    dependencies: skill.dependencies,
  }
}

/** Keep card content; admission and source hashes do not render on these pages. */
export function ownerPageProfile(profile: OrgProfile) {
  return { ...profile, skills: profile.skills.map(profileSkill) }
}

/** Decide missing-path recovery before dropping the other Repositories' Skills. */
export function repoPageProfile(profile: OrgProfile, repo: string) {
  return {
    ...profile,
    skills: selectRepoSkills(profile, repo).map(profileSkill),
    repos: profile.repos.filter(candidate => candidate.repo.toLowerCase() === repo.toLowerCase()),
    missingRepoTarget: resolveMissingRepoRedirect({ owner: profile.owner, repo, skills: profile.skills }),
  }
}

/**
 * `useFetch<OrgProfile>` asserts its response type, so a partial body reaches the
 * page as a truthy object whose arrays are missing (Sentry SKILLD-E). Read them
 * defensively here rather than at each call site.
 */
export function selectRepoSkills<T extends { repo: string, name: string, modifiedAt?: number | null, pushedAt?: number | null }>(profile: { skills: T[] } | null | undefined, repo: string): T[] {
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
      return a.name.localeCompare(b.name)
    })
}

export function selectRepoInfo<T extends { repo: string }>(profile: { repos: T[] } | null | undefined, repo: string): T | null {
  const repos = profile?.repos
  if (!Array.isArray(repos))
    return null
  return repos.find(candidate => candidate.repo === repo) ?? null
}
