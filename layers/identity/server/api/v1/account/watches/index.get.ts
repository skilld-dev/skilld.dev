import { watchesV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentWatches } from '../../../../presenters/account-v1'
import { loadWatches } from '../../../../utils/watches'

export default defineApiOperation({
  operation: watchesV1.operations.list,
  handler: async ({ platform, input, user }) => presentWatches(await loadWatches(platform.db, user.id), input.query),
})
