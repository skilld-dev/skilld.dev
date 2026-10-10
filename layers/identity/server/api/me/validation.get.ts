import { defineApiHandler } from '#shared/server/handler'
import { identitySkillValidationSchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { skillValidationPresenter } from '../../presenters/skill-validation'
import { loadAccountSkillValidation } from '../../utils/skill-validation'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  response: identitySkillValidationSchema,
  presenter: skillValidationPresenter,
  handler: async ({ event, platform }) => {
    const user = await requireUserRow(event)
    return loadAccountSkillValidation(platform.db, user.login)
  },
})
