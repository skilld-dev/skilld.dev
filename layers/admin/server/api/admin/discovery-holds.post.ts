import { z } from 'zod'
import { releaseLedgerHold, reviewLedgerEntry } from '#shared/server/discovery-ledger'
import { defineApiHandler } from '#shared/server/handler'

/**
 * Two decisions on a parked discovery, and no third.
 *
 * `release` clears `held_reason` only. The next `submitDiscoveredRepos` tick
 * picks the row up through the ordinary path, re-measures it, and enqueues it.
 * Nothing here submits directly, so the 25-skill guard keeps working and a
 * human saying yes stays the only way past it (VISION.md principle 2).
 *
 * `reject` is terminal. Discovery keeps counting mentions on a rejected row
 * but never resubmits it, so a repo turned down once does not come back every
 * time someone posts about it.
 */
const input = z.object({
  id: z.number().int().positive(),
  decision: z.enum(['release', 'reject']),
  note: z.string().trim().min(10, 'Say why in at least 10 characters.').max(300),
})

export default defineApiHandler({
  schema: input,
  handler: async ({ body, event, platform }) => {
    const admin = await requireAdmin(event)
    const now = Math.floor(Date.now() / 1000)

    const result = body.decision === 'release'
      ? await releaseLedgerHold({
          db: platform.db,
          id: body.id,
          reviewedBy: admin.email,
          note: body.note,
          now,
        })
      : await reviewLedgerEntry({
          db: platform.db,
          id: body.id,
          status: 'rejected',
          reviewedBy: admin.email,
          note: body.note,
          now,
        })

    // A silent no-op here reads as success and the row comes back on the next
    // refresh with nothing to explain it. Report it instead.
    if (result._tag === 'no-matching-row') {
      throw createError({
        statusCode: 409,
        statusMessage: 'This discovery is no longer held. Refresh the list.',
      })
    }

    return { decision: body.decision, id: body.id }
  },
})
