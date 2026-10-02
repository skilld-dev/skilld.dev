import type { CommunityDirectoryResponse } from '../../community.get'
import { curatorsV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentCuratorDirectory } from '../../../presenters/collection-v1'

/** Reads the directory route in process, so v1 shares its origin cache. The directory query is the costly one. */
export default defineApiOperation({
  operation: curatorsV1.operations.list,
  handler: async ({ event, input }) => presentCuratorDirectory(
    await event.$fetch<CommunityDirectoryResponse>('/api/community'),
    input.query,
  ),
})
