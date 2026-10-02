import type { LegacyTrackCard } from '../../../presenters/track-v1'
import { tracksV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { presentTrackList } from '../../../presenters/track-v1'

/** Reads the homepage track grid in process, so v1 shares its ten-minute cache. */
export default defineApiOperation({
  operation: tracksV1.operations.list,
  handler: async ({ event }) => {
    const grid = await event.$fetch<{ items: LegacyTrackCard[] }>('/api/clusters')
    return presentTrackList(grid.items)
  },
})
