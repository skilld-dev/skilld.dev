import { accountV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { presentRepositoryScan } from '../../../../presenters/account-v1'
import { scanAccountRepositories } from '../../../../utils/account-repositories'
import { getUserById } from '../../../../utils/users'

export default defineApiOperation({
  operation: accountV1.operations.scanRepositories,
  handler: async ({ event, platform, user }) => {
    const row = await getUserById(event, user.id)
    if (!row)
      return operationFailure('AUTH_REQUIRED', 'This account no longer exists. Sign in again.')
    const scan = await scanAccountRepositories({
      db: platform.db,
      env: platform.env,
      tokenKey: useRuntimeConfig(event).tokenKey as string,
      user: row,
    })
    if (scan._tag === 'IndexingOff')
      return operationFailure('FORBIDDEN', 'Repository indexing is off for this account. Turn on `repositoryIndexing` first.')
    return presentRepositoryScan(scan.result)
  },
})
