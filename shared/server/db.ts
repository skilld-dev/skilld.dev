/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'

/**
 * Read the request-scoped D1 binding from `event.context.platform`.
 *
 * Mounted by `server/plugins/platform.ts`. New handlers should prefer
 * `defineApiHandler` (`shared/server/handler.ts`), which gives `platform`
 * directly in the ctx.
 */
export function getDB(event: H3Event): D1Database {
  return event.context.platform.db
}
