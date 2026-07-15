/// <reference types="@cloudflare/workers-types" />

/**
 * Request-scoped infrastructure handle.
 *
 * Mounted onto `event.context.platform` by `server/plugins/platform.ts`.
 * Handlers must read bindings from here, never from `event.context.cloudflare.env`
 * directly — that path keeps adapter swap-in/out at one seam.
 */
export interface Platform {
  db: D1Database
  ai: Ai
  SKILLD_ANALYTICS?: AnalyticsEngineDataset
  env: Cloudflare.Env
  requestId: string
}

export type CloudflareEnv = Cloudflare.Env

declare module 'h3' {
  interface H3EventContext {
    platform: Platform
  }
}
