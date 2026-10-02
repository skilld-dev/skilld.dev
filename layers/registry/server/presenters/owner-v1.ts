import type { OperationResult, ownersV1 } from 'skilld-sdk/contract'
import type { SkillCardSource } from '#shared/server/skill-cards'
import { SKILLD_V1_ORIGIN } from 'skilld-sdk/contract'
import { presentCount } from '#shared/server/skill-cards'
import { ownerHubPath, repoHubPath } from '#shared/skill-routes'

/**
 * The fields of the `/api/orgs/<owner>` answer that `owners.get` and
 * `repositories.get` read. The Owner and Repository pages on skilld.dev read
 * the same answer, so the API lists what those pages list.
 */
export interface LegacyOwnerProfile {
  /** Lowercase. The route folds the login before it reads. */
  owner: string
  kind: 'org' | 'user'
  /** The GitHub profile name, or the login when the registry has no name. */
  displayName: string
  avatar: string
  /** Most Skills first. */
  repos: { repo: string, count: number, stars: number, description: string | null }[]
  skills: (SkillCardSource & { pushedAt: number | null })[]
}

export function presentOwner(profile: LegacyOwnerProfile): OperationResult<typeof ownersV1.operations.get> {
  return {
    login: profile.owner,
    name: profile.displayName && profile.displayName !== profile.owner ? profile.displayName : null,
    avatarUrl: profile.avatar,
    kind: profile.kind === 'user' ? 'user' : 'organization',
    pageUrl: `${SKILLD_V1_ORIGIN}${ownerHubPath(profile.owner)}`,
    repositories: profile.repos.map(entry => ({
      repository: entry.repo,
      description: entry.description,
      stars: presentCount(entry.stars),
      skillCount: presentCount(entry.count),
      pageUrl: `${SKILLD_V1_ORIGIN}${repoHubPath(profile.owner, entry.repo)}`,
    })),
  }
}
