// Phase 1 cleanup: /people/* was the atproto-handle namespace; collections
// now live under /@<gh-login>. Special-case the legacy author profile -> 301
// to the new path; everything else returns 410 Gone so search engines drop
// the old URLs.
export default defineEventHandler((event) => {
  const url = event.path
  if (!url || !url.startsWith('/people'))
    return

  if (url === '/people/harlanzw.com' || url === '/people/harlanzw.com/')
    return sendRedirect(event, '/@harlanzw', 301)

  throw createError({ statusCode: 410, statusMessage: 'Gone' })
})
