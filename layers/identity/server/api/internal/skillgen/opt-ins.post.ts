import { defineApiHandler } from '#shared/server/handler'
import { skillgenService } from '../../../policies/skillgen-service'
import { skillgenOptInsPresenter } from '../../../presenters/skillgen'
import { SkillgenOptInsBody } from '../../../schemas/skillgen'
import { optedInSkillgenRepositories } from '../../../utils/skillgen'

/** The skill-harness Worker asks which repositories in one GitHub event opted in to Skillgen. */
export default defineApiHandler({
  schema: SkillgenOptInsBody,
  policy: [skillgenService],
  handler: async ({ event, body, platform }) => {
    setHeader(event, 'cache-control', 'no-store')
    return optedInSkillgenRepositories(platform.db, body.repositories)
  },
  presenter: skillgenOptInsPresenter,
})
