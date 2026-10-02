import { likesV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { loadSkillCardRows } from '#shared/server/skill-cards'
import { presentLikedSkills } from '../../../../presenters/account-v1'
import { listLikedSkillRefs } from '../../../../utils/likes'

export default defineApiOperation({
  operation: likesV1.operations.list,
  handler: async ({ platform, input, user }) => {
    const page = await listLikedSkillRefs(platform.db, user.id, input.query)
    return presentLikedSkills(page, await loadSkillCardRows(platform.db, page.refs))
  },
})
