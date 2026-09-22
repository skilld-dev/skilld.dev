import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { ReposScanBody } from '../../../schemas/repos'
import { ownedRepoScanResponse, scanOwnedRepos } from '../../../utils/scan-owned-repos'
import { requireGithubUserToken, requireUserRow } from '../../../utils/users'

/**
 * Scans the account's public repositories for Skills and indexes them.
 *
 * Indexing is on by default and sign-in runs the same scan. An account that
 * turned it off in /me gets no scan from here either, so the switch is the one
 * place that decides.
 */
export default defineApiHandler({
  schema: ReposScanBody,
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    if (!u.repo_indexing)
      throw createError({ statusCode: 403, message: 'Repository indexing is turned off for this account' })
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
