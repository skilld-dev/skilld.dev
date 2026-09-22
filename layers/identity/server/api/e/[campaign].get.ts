import { getQuery, getRouterParam, sendRedirect, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { parseEmailClick, recordEmailClick } from '../../utils/email-clicks'

/**
 * Counts a click from the weekly or digest email, then sends the reader on.
 *
 * Only the aggregate counter changes. The link names no reader, and nothing
 * from the request is stored beyond the campaign, issue, placement, and path.
 * The wide event carries the campaign and placement, never the path.
 *
 * Counting is best effort. A reader who clicked is owed the page, so a failed
 * write is reported and the redirect still happens.
 */
export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const click = parseEmailClick(getRouterParam(event, 'campaign'), getQuery(event))

    if (click._tag === 'counted') {
      const { campaign, placement } = click.key
      await recordEmailClick(platform.db, click.key, new Date()).then(
        () => emitOperationalEvent(createWideEvent({ operation: 'email-click', outcome: 'success', reason: `${campaign}/${placement}` }), 'info'),
        (error: unknown) => emitOperationalEvent(createWideEvent({
          operation: 'email-click',
          outcome: 'failed',
          reason: `${campaign}/${placement}: ${error instanceof Error ? error.name : 'unknown'}`,
        })),
      )
    }
    else {
      emitOperationalEvent(createWideEvent({ operation: 'email-click', outcome: 'skipped', reason: click.reason }), 'info')
    }

    // A click is a one-off, and a cached redirect would hide every later one.
    setHeader(event, 'cache-control', 'private, no-store')
    // An invalid target names no page. Home is the safe landing.
    return sendRedirect(event, click._tag === 'invalid' ? '/' : click.to, 302)
  },
})
