import { curatorsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentCurator } from '../../../../presenters/collection-v1'
import { loadCuratorCollections, loadCuratorProfile } from '../../../../utils/collections'

export default defineApiOperation({
  operation: curatorsV1.operations.get,
  handler: async ({ platform, input }) => {
    const { login } = input.params
    const profile = await loadCuratorProfile(platform.db, login)
    if (!profile)
      return operationFailure('NOT_FOUND', `No skilld.dev account has the login ${login}.`)
    return presentCurator(profile, await loadCuratorCollections(platform.db, login))
  },
})
