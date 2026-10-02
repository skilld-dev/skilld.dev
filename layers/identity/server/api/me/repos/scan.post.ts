import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { ReposScanBody } from '../../../schemas/repos'
import { scanAccountRepositories } from '../../../utils/account-repositories'
import { ownedRepoScanResponse } from '../../../utils/scan-owned-repos'
import { requireUserRow } from '../../../utils/users'

/** Scans the account's public repositories for Skills and indexes them. */
export default defineApiHandler({
  schema: ReposScanBody,
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const config = useRuntimeConfig(event)
    const scan = await scanAccountRepositories({
      db: platform.db,
      env: platform.env,
      tokenKey: config.tokenKey as string,
      user: u,
    })
    if (scan._tag === 'IndexingOff')
      throw createError({ statusCode: 403, message: 'Repository indexing is turned off for this account' })
    return ownedRepoScanResponse(scan.result)
  },
})
