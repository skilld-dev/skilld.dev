// 2026-08-22: canonical trailing-slash policy, from a technical SEO audit. Nuxt served 200 on both `/gh/x/y` and `/gh/x/y/`, and canonicals
// point at the no-slash form, so Google registered duplicate URLs (37 pages
// in "Duplicate, Google chose different canonical"). One URL per page:
// strip the trailing slash with a 301.
//
// Scope: HTML page paths only. Excluded: the root `/`, any path with a file
// extension (assets, `.md`, `.xml`), `/api/**` (API shape is not ours to
// change), and query strings are preserved.
const SKIP_PREFIXES = ['/api/', '/_']

export default defineEventHandler((event) => {
  const path = event.path
  if (!path || path.length < 2)
    return

  const queryIndex = path.indexOf('?')
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : path.slice(queryIndex)

  if (!pathname.endsWith('/') || pathname === '/')
    return

  if (pathname.includes('.'))
    return

  if (SKIP_PREFIXES.some(p => pathname.startsWith(p)))
    return

  return sendRedirect(event, `${pathname.slice(0, -1)}${query}`, 301)
})
