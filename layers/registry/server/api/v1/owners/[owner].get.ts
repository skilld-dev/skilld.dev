import type { LegacyOwnerProfile } from '../../../presenters/owner-v1'
import { ownersV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentOwner } from '../../../presenters/owner-v1'
import { readOwnRoute } from '../../../utils/own-route-read'

/**
 * Reads the Owner page's own profile route in process, so v1 shares its cache
 * and its GitHub budget. That route reads GitHub only for an Owner the
 * registry holds Skills from, and at most once a week per Owner.
 */
export default defineApiOperation({
  operation: ownersV1.operations.get,
  handler: async ({ event, input }) => {
    const { owner } = input.params
    const profile = await readOwnRoute<LegacyOwnerProfile>(event, `/api/orgs/${owner}`)
    return profile._tag === 'found'
      ? presentOwner(profile.value)
      : operationFailure('NOT_FOUND', `The registry holds no Skills from ${owner}.`)
  },
})
