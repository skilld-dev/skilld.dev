import { listLedger } from '#shared/server/discovery-ledger'
import { SKILL_LIMIT_BY_OWNER_KIND } from '#shared/server/discovery-size-guard'
import { defineApiHandler } from '#shared/server/handler'

/**
 * Enough rows that the reviewer sees the whole parked tail in one page. It sat
 * at 35 when this shipped and grows by a handful a day, so a scrolling list is
 * the right shape and pagination would only hide the backlog.
 */
const HOLD_LIMIT = 200

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    await requireAdmin(event)

    const holds = await listLedger({
      db: platform.db,
      status: 'pending',
      parked: 'held',
      limit: HOLD_LIMIT,
    })

    return {
      // Both limits, because the reviewer cannot judge a count without knowing
      // which one the repository was measured against.
      skillLimits: SKILL_LIMIT_BY_OWNER_KIND,
      holds: holds.map(entry => ({
        id: entry.id,
        source: entry.source,
        owner: entry.owner,
        repo: entry.repo,
        heldReason: entry.heldReason,
        skillCount: entry.skillCount,
        evidenceScore: entry.evidenceScore,
        mentionCount: entry.mentionCount,
        evidenceUrl: entry.evidenceUrl,
        evidenceText: entry.evidenceText,
        firstSeenAt: entry.firstSeenAt,
      })),
    }
  },
})
