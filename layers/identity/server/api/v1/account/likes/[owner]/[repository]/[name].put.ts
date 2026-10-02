import { likesV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { likeSkill, skillExists } from '../../../../../../utils/likes'

/** `likeSkill` also watches the Repository, and throws the 429 that answers RATE_LIMITED. */
export default defineApiOperation({
  operation: likesV1.operations.create,
  handler: async ({ platform, input, user }) => {
    const { owner, repository, name } = input.params
    const ref = { owner, repo: repository, name }
    if (!await skillExists(platform.db, ref))
      return operationFailure('NOT_FOUND', `The registry holds no Skill ${owner}/${repository}/${name}.`)
    await likeSkill(platform.db, user.id, ref)
    return null
  },
})
