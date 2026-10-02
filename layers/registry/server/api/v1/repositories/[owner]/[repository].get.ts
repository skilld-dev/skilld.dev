import type { LegacyOwnerProfile } from '../../../../presenters/owner-v1'
import { repositoriesV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentRepository, selectRepositorySkills } from '../../../../presenters/repository-v1'
import { readOwnRoute } from '../../../../utils/own-route-read'
import { resolveRepoSourceIdentity } from '../../../../utils/repo-source-identity'

/**
 * Reads the Owner profile the Repository page reads, so the Skills listed are
 * the Skills the page lists, from the same cache.
 */
export default defineApiOperation({
  operation: repositoriesV1.operations.get,
  handler: async ({ event, platform, input }) => {
    const { owner, repository } = input.params
    const profile = await readOwnRoute<LegacyOwnerProfile>(event, `/api/orgs/${owner}`)
    const [first, ...rest] = profile._tag === 'found' ? selectRepositorySkills(profile.value, repository) : []
    if (profile._tag === 'missing' || !first)
      return operationFailure('NOT_FOUND', `The registry holds no Skills from ${owner}/${repository}.`)
    const source = await resolveRepoSourceIdentity(platform.db, { owner: first.owner, repo: first.repo })
    return presentRepository(profile.value, [first, ...rest], source)
  },
})
