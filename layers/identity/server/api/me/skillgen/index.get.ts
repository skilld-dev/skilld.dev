import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { skillgenRepositoriesPresenter } from '../../../presenters/skillgen'
import { githubUserGet, inspectSkillgenRows, listMaintainedRepositories, skillgenCandidates, skillgenRefusal } from '../../../utils/skillgen'
import { requireGithubUserToken, requireUserRow } from '../../../utils/users'

/**
 * Lists the public repositories the account maintains that hold a Skill in
 * the registry, each with its Skillgen opt-in and whether Skillgen can run there.
 */
export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const token = await requireGithubUserToken(platform.db, u.id, useRuntimeConfig(event).tokenKey as string)
    const github = githubUserGet(token)
    const listed = await listMaintainedRepositories(github)
    if (listed._tag === 'GithubUnavailable')
      throw createError(skillgenRefusal(listed))
    return inspectSkillgenRows(github, await skillgenCandidates(platform.db, listed.repositories))
  },
  presenter: skillgenRepositoriesPresenter,
})
