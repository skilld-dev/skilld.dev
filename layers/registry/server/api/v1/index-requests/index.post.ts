import { indexRequestsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { indexedSkillKeys, parseRepositoryReference, presentIndexRequestCreated } from '../../../presenters/index-request-v1'
import { submitRepositoryIndex } from '../../../utils/repository-index'
import { findSkillsByKeys } from '../../../utils/skills-registry'

export default defineApiOperation({
  operation: indexRequestsV1.operations.create,
  handler: async ({ event, platform, input }) => {
    const repository = parseRepositoryReference(input.body.repository)
    if (repository._tag !== 'repository')
      return operationFailure('INVALID_REQUEST', 'Send owner/repository or the URL of a public GitHub Repository.')
    const answer = await submitRepositoryIndex(platform, repository)
    const cards = answer._tag === 'indexed'
      ? await findSkillsByKeys(event, indexedSkillKeys(answer.repository, answer.skills))
      : new Map()
    return presentIndexRequestCreated(answer, cards)
  },
})
