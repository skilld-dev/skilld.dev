import { defineApiHandler } from '#shared/server/handler'
import { parseWeeklyClick } from '../../utils/weekly-tracking'

/**
 * Records a click from the weekly email, then sends the reader on.
 *
 * The destination is a site-relative path and the origin is rebuilt here from
 * the request, so this endpoint cannot redirect off-site whatever the query
 * says. A tracking redirect that accepts an absolute URL is an open redirect,
 * and an open redirect reached from an email is a phishing primitive.
 *
 * The recording is best effort. A reader clicking a link is owed the page, not
 * an error because an analytics insert failed, so a write failure is logged and
 * the redirect happens anyway.
 */
export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const target = parseWeeklyClick(getQuery(event))
    if (target._tag === 'invalid') {
      emitOperationalEvent(createWideEvent({
        operation: 'weekly-click',
        outcome: 'failed',
        reason: target.reason,
      }))
      return sendRedirect(event, '/', 302)
    }

    await platform.db.prepare(
      `INSERT INTO weekly_click_events (user_id, window_end, placement, path, clicked_at)
       VALUES (?1, ?2, ?3, ?4, unixepoch())`,
    ).bind(target.userId, target.windowEnd, target.placement, target.path).run().catch((error) => {
      emitOperationalEvent(createWideEvent({
        operation: 'weekly-click',
        outcome: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      }))
    })

    emitOperationalEvent(createWideEvent({
      operation: 'weekly-click',
      outcome: 'success',
      reason: target.placement,
    }))

    // A click is a one-off, and a cached redirect would hide every later one.
    setHeader(event, 'cache-control', 'private, no-store')
    return sendRedirect(event, target.path, 302)
  },
})
