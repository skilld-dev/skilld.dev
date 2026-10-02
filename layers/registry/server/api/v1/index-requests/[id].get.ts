import { indexRequestsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { indexedSkillKeys, presentIndexRequest } from '../../../presenters/index-request-v1'
import { readRepositoryIndexStatus } from '../../../utils/repository-index'
import { findSkillsByKeys } from '../../../utils/skills-registry'

export default defineApiOperation({
  operation: indexRequestsV1.operations.get,
  handler: async ({ event, platform, input }) => {
    const { id } = input.params
    const answer = await readRepositoryIndexStatus(platform.db, id)
    if (answer._tag === 'missing')
      return operationFailure('NOT_FOUND', `No index request ${id}.`)
    const cards = answer._tag === 'indexed'
      ? await findSkillsByKeys(event, indexedSkillKeys(answer.repository, answer.skills))
      : new Map()
    return presentIndexRequest(id, answer, cards)
  },
})
