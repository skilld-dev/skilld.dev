import type { LegacyTrendingFeed } from '../../presenters/trending-v1'
import { TRENDING_WINDOW_HOURS, trendingV1 } from 'skilld-sdk/contract'
import { defineApiOperation } from '#shared/server/operation'
import { TRENDING_BOARD_LIMIT } from '#shared/trending-range'
import { presentTrending, trendingBoardRows } from '../../presenters/trending-v1'
import { findSkillsByKeys } from '../../utils/skills-registry'

/**
 * Reads the trending feed in process with the exact query the trending page
 * sends, so v1 ranks the same board from the same five-minute cache, then
 * slices it to `limit`.
 */
export default defineApiOperation({
  operation: trendingV1.operations.list,
  handler: async ({ event, input }) => {
    const windowHours = TRENDING_WINDOW_HOURS[input.query.window]
    const feed = await event.$fetch<LegacyTrendingFeed>(`/api/feed/trending?limit=${TRENDING_BOARD_LIMIT}&window=${windowHours}`)
    const rows = trendingBoardRows(feed)
    const cards = await findSkillsByKeys(event, rows.map(row => row.skill))
    return presentTrending(rows, cards, input.query.limit)
  },
})
