// Legacy /skills/<owner>[/repo[/name]] URLs were the catch-all entry point.
// The marketing layer now owns /skills/* literals; everything else under
// /skills/ is a registry entity and redirects to /gh/. See ADR-0001.
const MARKETING_PATHS = new Set([
  '/skills',
  '/skills/',
  '/skills/guide',
  '/skills/official',
  '/skills/stats',
])

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/skills/') && url.pathname !== '/skills')
    return
  if (MARKETING_PATHS.has(url.pathname))
    return
  const tail = url.pathname.slice('/skills'.length)
  return sendRedirect(event, `/gh${tail}${url.search}`, 301)
})
