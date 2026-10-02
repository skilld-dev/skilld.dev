import { likesV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { unlikeSkill } from '../../../../../../utils/likes'

export default defineApiOperation({
  operation: likesV1.operations.delete,
  handler: async ({ platform, input, user }) => {
    const { owner, repository, name } = input.params
    await unlikeSkill(platform.db, user.id, { owner, repo: repository, name })
    return null
  },
})
