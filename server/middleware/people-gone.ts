import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'
import { createGoneResponse } from '../utils/gone-response'

// Phase 1 cleanup: /people/* was the atproto-handle namespace; collections
// now live under /@<gh-login>. Special-case the legacy author profile -> 301
// to the new path; everything else returns 410 Gone so search engines drop
// the old URLs without triggering /__nuxt_error Vue SSR.
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (!pathname.startsWith('/people'))
    return

  if (pathname === '/people/harlanzw.com' || pathname === '/people/harlanzw.com/')
    return sendRedirect(event, '/@harlanzw', 301)

  return createGoneResponse(event)
})
