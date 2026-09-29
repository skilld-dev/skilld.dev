import type { H3Event } from 'h3'
import type { Platform } from '#shared/server/platform'
import { resolveCloudflareBindings, setCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { getCookie, getResponseHeader, setCookie } from 'h3'
import {
  chooseD1Consistency,
  createPlatformD1,
  D1_BOOKMARK_COOKIE,
  D1_BOOKMARK_COOKIE_MAX_AGE,
  decideD1BookmarkCookie,
  parseD1Bookmark,
} from '../utils/db'

// SWR background refreshes and some internal $fetch contexts arrive with
// event.context.cloudflare unset, which would skip platform attachment and
// surface as 500s in defineApiHandler. Nitro exposes the current Worker env on
// globalThis.__env__, so context-less requests can resolve it without retaining
// the first request's env across later binding-only deployments.

// Read replication: each request gets one D1 session. Reads may run on the
// nearest replica; a write hands its bookmark to the visitor's next request so
// they read their own write. Cron tasks, queue consumers, and db0 use the raw
// binding and stay on the primary.

function headerValue(value: ReturnType<typeof getResponseHeader>): string | undefined {
  if (value === undefined || value === null)
    return undefined
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function carryBookmark(event: H3Event, bookmark: string | null): void {
  const decision = decideD1BookmarkCookie({
    bookmark,
    responseSent: event.handled || event.node.res.headersSent,
    cacheControl: [
      headerValue(getResponseHeader(event, 'cache-control')),
      headerValue(getResponseHeader(event, 'cloudflare-cdn-cache-control')),
    ],
  })
  if (decision._tag === 'skip')
    return
  setCookie(event, D1_BOOKMARK_COOKIE, decision.bookmark, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: D1_BOOKMARK_COOKIE_MAX_AGE,
  })
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const env = resolveCloudflareBindings<Cloudflare.Env>(event.context)
    if (!env)
      return

    const d1 = createPlatformD1(env, {
      consistency: chooseD1Consistency({
        method: event.method,
        bookmark: parseD1Bookmark(getCookie(event, D1_BOOKMARK_COOKIE)),
      }),
      onWrite: bookmark => carryBookmark(event, bookmark),
    })
    // db0's Cloudflare connector reads the binding from
    // this Nitro-managed global instead of the request context.
    setCloudflareBindings(d1.bindings)

    const platform: Platform = {
      db: d1.database,
      ai: env.AI,
      env: d1.bindings,
      requestId: crypto.randomUUID(),
    }
    event.context.platform = platform
  })
})
