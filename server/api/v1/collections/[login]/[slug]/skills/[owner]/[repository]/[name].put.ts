import { collectionsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { loadSkillCardRows, skillCardKey } from '#shared/server/skill-cards'
import { presentCollectionSkill } from '../../../../../../../../presenters/collection-v1'
import { findAuthorCollectionId, putCollectionSkill } from '../../../../../../../../utils/collections'

export default defineApiOperation({
  operation: collectionsV1.operations.addSkill,
  handler: async ({ platform, input, user }) => {
    const { login, slug, owner, repository, name } = input.params
    if (login !== user.login)
      return operationFailure('FORBIDDEN', 'You can change only your own collections.')
    const collectionId = await findAuthorCollectionId(platform.db, user.id, slug)
    if (collectionId === null)
      return operationFailure('NOT_FOUND', `You have no collection with the slug ${slug}.`)

    const skill = { owner, repo: repository, name }
    const summary = (await loadSkillCardRows(platform.db, [skill])).get(skillCardKey(skill))
    if (!summary)
      return operationFailure('NOT_FOUND', `The registry has no Skill ${owner}/${repository}/${name}.`)

    const reason = await putCollectionSkill(platform.db, collectionId, skill, input.body.reason)
    return presentCollectionSkill(summary, reason)
  },
})
