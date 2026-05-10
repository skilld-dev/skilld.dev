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
  env: CloudflareEnv
  requestId: string
}

export interface CloudflareEnv {
  DB: D1Database
  AI: Ai
  KV_CACHE: KVNamespace
  KV_DATA: KVNamespace
  EMAIL: { send: (msg: unknown) => Promise<void> }
  [key: string]: unknown
}

declare module 'h3' {
  interface H3EventContext {
    platform: Platform
  }
}
