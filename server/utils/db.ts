/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'

const RETRYABLE_D1_ERROR_MESSAGES = [
  'network connection lost',
  'storage caused object to be reset',
  'reset because its code was updated',
  'cannot resolve d1 db due to transient issue on remote node',
]

interface RetryD1Options {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
  sleep?: (delayMs: number) => Promise<void>
}

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

/**
 * Retry a D1 write only when the caller knows it is idempotent.
 *
 * D1 retries read-only statements automatically. Writes need an explicit,
 * application-level decision because repeating a non-idempotent statement can
 * duplicate side effects. The operation callback deliberately recreates the
 * prepared statement for each attempt, matching Cloudflare's guidance.
 */
export async function retryIdempotentD1Write<T>(
  operation: () => Promise<T>,
  options: RetryD1Options = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 5))
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 50)
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 1000)
  const random = options.random ?? Math.random
  const sleep = options.sleep ?? ((delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs)))

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    }
    catch (error) {
      if (attempt >= maxAttempts || !isRetryableD1Error(error))
        throw error

      const backoffCeiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
      const jitter = Math.min(1, Math.max(0, random()))
      const delayMs = Math.floor(backoffCeiling * (0.5 + jitter * 0.5))
      await sleep(delayMs)
    }
  }
}

function isRetryableD1Error(error: unknown): boolean {
  const message = String(error).toLowerCase()
  return RETRYABLE_D1_ERROR_MESSAGES.some(candidate => message.includes(candidate))
}
