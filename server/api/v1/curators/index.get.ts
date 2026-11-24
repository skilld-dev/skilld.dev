import type { CommunityDirectoryResponse } from '../../community.get'
import { serverFetch } from 'nuxt/server'
import { curatorsV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { authSessionEvent } from '#shared/server/session-access'
import { presentCuratorDirectory } from '../../../presenters/collection-v1'

/** Reads the directory route in process, so v1 shares its origin cache. The directory query is the costly one. */
export default defineApiOperation({
  operation: curatorsV1.operations.list,
  handler: async ({ event, input }) => {
    const response = await serverFetch(authSessionEvent(event), '/api/community')
    if (!response.ok)
      throw createError({ statusCode: response.status, statusMessage: response.statusText })
    return presentCuratorDirectory(await response.json() as CommunityDirectoryResponse, input.query)
  },
})
