import type { OperationResult, repositoriesV1 } from 'skilld-sdk/contract'
import type { LegacyOwnerProfile } from './owner-v1'
import { SKILLD_V1_ORIGIN } from 'skilld-sdk/contract'
import { epochSecondsToIso, presentCount, presentSkillSummaries } from '#shared/server/skill-cards'
import { gitInstallCmd } from '#shared/skill-commands'
import { repoHubPath } from '#shared/skill-routes'

type ProfileSkill = LegacyOwnerProfile['skills'][number]

/** The profile's Skills from one Repository, matched without regard to case as the Repository page does. */
export function selectRepositorySkills(profile: LegacyOwnerProfile, repository: string): ProfileSkill[] {
  const wanted = repository.toLowerCase()
  return profile.skills.filter(skill => skill.repo.toLowerCase() === wanted)
}

/** Most recent SKILL.md change first, then by name: the Repository page's default order. */
function byLastChange(left: ProfileSkill, right: ProfileSkill): number {
  if (left.modifiedAt !== right.modifiedAt) {
    if (left.modifiedAt == null)
      return 1
    if (right.modifiedAt == null)
      return -1
    return right.modifiedAt - left.modifiedAt
  }
  return left.name.localeCompare(right.name)
}

/**
 * One Repository profile.
 *
 * `source` is where the Repository lives on GitHub now. After a rename or a
 * transfer the two differ until sync moves the registry rows (ADR-0015).
 */
export function presentRepository(
  profile: LegacyOwnerProfile,
  skills: readonly [ProfileSkill, ...ProfileSkill[]],
  source: { owner: string, repo: string },
): OperationResult<typeof repositoriesV1.operations.get> {
  const [first] = skills
  const entry = profile.repos.find(candidate => candidate.repo === first.repo)
  return {
    owner: first.owner,
    repository: first.repo,
    description: entry?.description ?? null,
    stars: presentCount(entry?.stars ?? first.stars),
    pushedAt: epochSecondsToIso(first.pushedAt),
    repositoryUrl: `https://github.com/${source.owner}/${source.repo}`,
    pageUrl: `${SKILLD_V1_ORIGIN}${repoHubPath(first.owner, first.repo)}`,
    installCommand: gitInstallCmd(first.owner, first.repo),
    skills: presentSkillSummaries([...skills].sort(byLastChange)),
  }
}
