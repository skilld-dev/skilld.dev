import { starsV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentStarredRepositories } from '../../../../presenters/account-v1'
import { loadStarredRows } from '../../../../utils/starred-repos'

export default defineApiOperation({
  operation: starsV1.operations.list,
  handler: async ({ platform, input, user }) => presentStarredRepositories(await loadStarredRows(platform.db, user.id), input.query),
})
