import { defineApiHandler } from '#shared/server/handler'
import { parseWeeklyClick } from '../../utils/weekly-tracking'

/**
 * Redirects the tracked links inside already delivered weekly and digest
 * emails.
 *
 * The click recording is retired, but every send still sitting in a subscriber's
 * inbox routes its links through here, so the endpoint stays: it validates the
 * destination and sends the reader on. It records nothing.
 *
 * The destination is a site-relative path and the origin is rebuilt by the
 * browser, so this endpoint cannot redirect off-site whatever the query says.
 * A tracking redirect that accepts an absolute URL is an open redirect, and an
 * open redirect reached from an email is a phishing primitive.
 */
export default defineApiHandler({
  handler: ({ event }) => {
    const target = parseWeeklyClick(getQuery(event))

    // An invalid target names no page. Home is the safe landing.
    const path = target._tag === 'ok' ? target.path : '/'

    // A click is a one-off, and a cached redirect would hide every later one.
    setHeader(event, 'cache-control', 'private, no-store')
    return sendRedirect(event, path, 302)
  },
})
