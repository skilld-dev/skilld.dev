import { watchesV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { unwatchRepository } from '../../../../../utils/watches'

export default defineApiOperation({
  operation: watchesV1.operations.delete,
  handler: async ({ platform, input, user }) => {
    await unwatchRepository(platform.db, user.id, { owner: input.params.owner, repo: input.params.repository })
    return null
  },
})
