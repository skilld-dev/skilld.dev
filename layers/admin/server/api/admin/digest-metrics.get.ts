import {
  digestRunMetrics,
  listDigestRunEngagement,
} from '#layers/identity/server/utils/digest-tracking'
// Admin-only digest engagement metrics (VISION principle 4: opens/clicks are
// the evidence bar for further Loop 2 investment).
//   GET /api/admin/digest-metrics            → recent sent runs + counts
//   GET /api/admin/digest-metrics?run=<id>   → per-run detail incl. per-link CTR
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    await requireAdmin(event)
    const db = platform.db

    const query = getQuery(event)
    const runId = Number.parseInt(String(query.run ?? ''), 10)
    if (Number.isInteger(runId) && runId > 0) {
      return {
        generatedAt: new Date().toISOString(),
        run: await digestRunMetrics(db, runId),
      }
    }

    const limit = Number.parseInt(String(query.limit ?? ''), 10)
    const runs = await listDigestRunEngagement(db, {
      limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
    })
    const opened = runs.filter(run => run.opens > 0).length
    const clicked = runs.filter(run => run.clicks > 0).length
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        runs: runs.length,
        openedRuns: opened,
        clickedRuns: clicked,
        openRate: runs.length ? opened / runs.length : 0,
        clickRate: runs.length ? clicked / runs.length : 0,
      },
      runs,
    }
  },
})
