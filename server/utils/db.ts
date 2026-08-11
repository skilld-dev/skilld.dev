/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'

const RETRYABLE_D1_ERROR_MESSAGES = [
  'network connection lost',
  'storage caused object to be reset',
  'reset because its code was updated',
  'cannot resolve d1 db due to transient issue on remote node',
  'd1 db is overloaded',
  'currently processing a long-running export',
]

export interface RetryD1Options {
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
  return await retryTransientD1(operation, options)
}

/**
 * Retry a read after D1's own transparent attempts have been exhausted.
 * Replaying a SELECT is safe; prepared statements are recreated by
 * `createD1ReadRetryDatabase` so a reset connection is never reused.
 */
export async function retryD1Read<T>(
  operation: () => Promise<T>,
  options: RetryD1Options = {},
): Promise<T> {
  return await retryTransientD1(operation, options)
}

async function retryTransientD1<T>(
  operation: () => Promise<T>,
  options: RetryD1Options,
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

const rawD1Statements = new WeakMap<object, D1PreparedStatement>()
const readRetryDatabases = new WeakSet<object>()

/**
 * D1 facade that adds bounded retries to read methods only. Writes and mixed
 * batches preserve D1's at-most-once application semantics and are delegated
 * without replay.
 */
export function createD1ReadRetryDatabase(
  db: D1Database,
  options: RetryD1Options = {},
): D1Database {
  if (readRetryDatabases.has(db as object))
    return db

  const prepare = (query: string): D1PreparedStatement => createReadRetryStatement(db, query, [], options)

  const retrying = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare')
        return prepare
      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) => target.batch(
          statements.map(statement => rawD1Statements.get(statement as object) ?? statement),
        )
      }
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  readRetryDatabases.add(retrying)
  return retrying
}

function createReadRetryStatement(
  db: D1Database,
  query: string,
  params: unknown[],
  options: RetryD1Options,
  prepared?: D1PreparedStatement,
): D1PreparedStatement {
  const rawStatement = () => {
    const statement = db.prepare(query)
    return params.length ? statement.bind(...params) : statement
  }
  const initial = prepared ?? rawStatement()
  let readAttempt = 0
  const statement = new Proxy(initial, {
    get(target, property) {
      if (property === 'bind') {
        return (...values: unknown[]) => createReadRetryStatement(
          db,
          query,
          values,
          options,
          target.bind(...values),
        )
      }
      if (property === 'all' || property === 'first' || property === 'raw') {
        return (...args: unknown[]) => retryD1Read(() => {
          const current = readAttempt++ === 0 ? initial : rawStatement()
          const read = Reflect.get(current, property, current) as (...readArgs: unknown[]) => Promise<unknown>
          return read.apply(current, args)
        }, options)
      }
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  rawD1Statements.set(statement, initial)
  return statement
}
