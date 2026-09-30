import { defineEventHandler, getRequestHost, sendRedirect, setResponseHeaders } from 'h3'
import { canonicalHostRedirect } from '../utils/canonical-host'

// 2026-09-30: Search Console crawl stats showed Googlebot requesting
// `www.skilld.dev` 68 times in 90 days, with DNS errors on under 1% of
// requests. The site served only the apex, so `www` had no record at all.
// Route `www` to this Worker (see `wrangler.jsonc`) and answer every path with
// one 301 to the same path and query on the apex, so www links and crawls
// consolidate on `https://skilld.dev`.
//
// Scanned middleware runs in filename order, and `canonical-host.ts` sorts
// before `guides-gone.ts`, `people-gone.ts`, `skill-source-gone.ts`, and
// `trailing-slash.ts`. Module handlers run after scanned middleware. So a
// `www` request gets this one 301 and reaches no other rule; the apex then
// applies its own rules to the redirected URL.
//
// Workers Cache keys on the path and query, never the host, and a route rule's
// cache headers are already on the event by the time this runs. So the 301 is
// always uncacheable: stored, it would answer the apex URL and loop.
export default defineEventHandler((event) => {
  const url = canonicalHostRedirect(getRequestHost(event), event.path)
  if (!url)
    return
  setResponseHeaders(event, {
    'cache-control': 'private, no-store',
    'cloudflare-cdn-cache-control': 'no-store',
  })
  return sendRedirect(event, url, 301)
})
