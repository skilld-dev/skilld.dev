import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { ReposScanBody } from '../../../schemas/repos'
import { ownedRepoScanResponse, scanOwnedRepos } from '../../../utils/scan-owned-repos'
import { requireGithubUserToken, requireUserRow } from '../../../utils/users'

export default defineApiHandler({
  schema: ReposScanBody,
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const config = useRuntimeConfig(event)
    const { db, env } = platform

    const userToken = await requireGithubUserToken(db, u.id, config.tokenKey as string)

    const result = await scanOwnedRepos({
      login: u.login,
      userToken,
      db,
      env,
    })

    return ownedRepoScanResponse(result)
  },
})
