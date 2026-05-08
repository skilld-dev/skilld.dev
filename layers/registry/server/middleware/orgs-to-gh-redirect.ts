// 301 /orgs and /orgs/* to /gh/* preserving the trailing path.
// Existing rankings on /orgs/[owner] redirect to canonical /gh/[owner].
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (url.pathname !== '/orgs' && !url.pathname.startsWith('/orgs/'))
    return
  const tail = url.pathname === '/orgs' ? '' : url.pathname.slice('/orgs'.length)
  return sendRedirect(event, `/gh${tail}${url.search}`, 301)
})
