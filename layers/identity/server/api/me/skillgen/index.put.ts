import type { SkillgenOptInResult } from '../../../../shared/contracts/skillgen'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { browserSession } from '../../../policies/browser-session'
import { skillgenOptInPresenter } from '../../../presenters/skillgen'
import { SkillgenRepositoryPutBody } from '../../../schemas/skillgen'
import {
  checkSkillgenEligibility,
  githubUserGet,
  optInSkillgenRepository,
  optOutSkillgenRepository,
  skillgenOptInUser,
  skillgenRefusal,
} from '../../../utils/skillgen'
import { requireGithubUserToken, requireUserRow } from '../../../utils/users'

/**
 * Turns Skillgen on or off for one repository.
 *
 * On needs admin or maintain access and a repository the Worker can run on.
 * Off needs the account that turned it on, or current admin or maintain access.
 */
export default defineApiHandler({
  schema: SkillgenRepositoryPutBody,
  policy: [authenticated, browserSession],
  handler: async ({ event, body, platform }): Promise<SkillgenOptInResult> => {
    const u = await requireUserRow(event)
    const repository = { owner: body.owner, repo: body.repo }
    if (!body.optedIn && await skillgenOptInUser(platform.db, repository) === u.id) {
      await optOutSkillgenRepository(platform.db, repository)
      return { _tag: 'Saved', ...repository, optedIn: false }
    }
    const token = await requireGithubUserToken(platform.db, u.id, useRuntimeConfig(event).tokenKey as string)
    const eligibility = await checkSkillgenEligibility(githubUserGet(token), repository)
    const maintains = eligibility._tag !== 'NotFound' && eligibility._tag !== 'NotMaintainer' && eligibility._tag !== 'GithubUnavailable'
    if (!body.optedIn && maintains) {
      await optOutSkillgenRepository(platform.db, repository)
      return { _tag: 'Saved', ...repository, optedIn: false }
    }
    if (eligibility._tag !== 'Eligible')
      return { _tag: 'Refused', message: skillgenRefusal(eligibility).message }
    const canonical = { owner: eligibility.owner, repo: eligibility.repo }
    await optInSkillgenRepository(platform.db, u.id, canonical, Date.now())
    return { _tag: 'Saved', ...canonical, optedIn: true }
  },
  presenter: skillgenOptInPresenter,
})
