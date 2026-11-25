import type { D1Consistency } from '@harlan-zw/nuxt-cloudflare/d1'
import type { H3Event } from 'h3'
import { isReplayableD1Sql, withD1ResetRecovery } from '@harlan-zw/nuxt-cloudflare/d1'

const D1_TERMINAL_METHODS = new Set<PropertyKey>(['first', 'run', 'all', 'raw'])
const RETRYABLE_D1_READ_MESSAGES = [
  'currently processing a long-running import',
  'currently processing a long-running export',
  'currently processing an import job',
  'd1 db is overloaded',
]

/**
 * How long one request waits in total for D1 to accept its reads again.
 *
 * D1 measures overload over a 10 second window, and its own automatic retries
 * skip overload. The 2026-11 overload bursts (SKILLD-50, SKILLD-5K) mostly ended
 * within 1 to 6 s, which outlasted the earlier 0.4 s budget. Every read of the
 * request shares this deadline, so sequential reads cannot multiply the wait.
 */
const READ_RETRY_BUDGET_MS = 4_000
const READ_RETRY_BASE_DELAY_MS = 400

interface D1MaintenanceRecoveryOptions {
  maxAttempts?: number
  now?: () => number
  random?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

interface ReadRetryPolicy {
  maxAttempts: number
  now: () => number
  random: () => number
  sleep: (milliseconds: number) => Promise<void>
  /** Set by the request's first retryable failure. */
  deadline: number | null
}

function createReadRetryPolicy(options: D1MaintenanceRecoveryOptions): ReadRetryPolicy {
  return {
    maxAttempts: Math.max(1, Math.floor(options.maxAttempts ?? 5)),
    now: options.now ?? Date.now,
    random: options.random ?? Math.random,
    sleep: options.sleep ?? ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))),
    deadline: null,
  }
}

interface PlatformD1Options extends D1MaintenanceRecoveryOptions {
  /**
   * Where the request session's first query may run. Defaults to the primary,
   * so a caller that does not choose keeps the latest data.
   */
  consistency?: D1Consistency
  /**
   * Called after a write completes, with the session bookmark that includes it.
   * The request shell uses it to hand the bookmark to the next request.
   */
  onWrite?: (bookmark: string | null) => void
}

export interface PlatformD1 {
  bindings: Cloudflare.Env
  database: D1Database
}

/** Cookie that carries a D1 bookmark from a write to the requests after it. */
export const D1_BOOKMARK_COOKIE = 'd1-bookmark'
/** Replica lag is seconds. An hour covers the user flow without pinning reads forever. */
export const D1_BOOKMARK_COOKIE_MAX_AGE = 60 * 60

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
// D1 bookmarks are hyphen-separated hex groups. The strict shape keeps a
// constraint keyword or an injected value out of `withSession`.
const D1_BOOKMARK_PATTERN = /^[0-9a-f]{1,64}(?:-[0-9a-f]{1,64}){1,7}$/i

/** Parse an untrusted bookmark value. Anything D1 did not issue is `null`. */
export function parseD1Bookmark(raw: string | undefined): string | null {
  if (!raw || raw.length > 512 || !D1_BOOKMARK_PATTERN.test(raw))
    return null
  return raw
}

/**
 * Choose the D1 session constraint for one request.
 *
 * A mutating request starts on the primary, so its own reads see every other
 * writer. A read after this visitor's own write continues from that write's
 * bookmark. Every other read may run on the nearest replica. With read
 * replication off, D1 serves all three from the primary.
 */
export function chooseD1Consistency(input: { method: string, bookmark: string | null }): D1Consistency {
  if (!SAFE_METHODS.has(input.method.toUpperCase()))
    return { _tag: 'first-primary' }
  if (input.bookmark)
    return { _tag: 'bookmark', bookmark: input.bookmark }
  return { _tag: 'first-unconstrained' }
}

export type D1BookmarkCookieDecision
  = | { _tag: 'set', bookmark: string }
    | { _tag: 'skip', reason: 'no-bookmark' | 'response-sent' | 'shared-cacheable' }

function isPrivateCacheControl(value: string | undefined): boolean {
  return value !== undefined && /\b(?:private|no-store)\b/i.test(value)
}

/**
 * Decide whether a write's bookmark may ride on this response as a cookie.
 *
 * `cacheControl` is `[Cache-Control, Cloudflare-CDN-Cache-Control]`. A
 * response a shared cache may store never gets a `Set-Cookie`: Workers Cache
 * treats a headerless 200 as cacheable, so a missing header counts as shared.
 */
export function decideD1BookmarkCookie(input: {
  bookmark: string | null
  responseSent: boolean
  cacheControl: readonly [string | undefined, string | undefined] | readonly (string | undefined)[]
}): D1BookmarkCookieDecision {
  if (!input.bookmark)
    return { _tag: 'skip', reason: 'no-bookmark' }
  if (input.responseSent)
    return { _tag: 'skip', reason: 'response-sent' }
  const [cacheControl, cdnCacheControl] = input.cacheControl
  if (!isPrivateCacheControl(cacheControl))
    return { _tag: 'skip', reason: 'shared-cacheable' }
  if (cdnCacheControl !== undefined && !isPrivateCacheControl(cdnCacheControl))
    return { _tag: 'skip', reason: 'shared-cacheable' }
  return { _tag: 'set', bookmark: input.bookmark }
}

type RetryOutcome<T> = { _tag: 'ok', value: T } | { _tag: 'error', error: unknown }

export function createPlatformD1(
  env: Cloudflare.Env,
  options: PlatformD1Options = {},
): PlatformD1 {
  const rawStatements = new WeakMap<object, D1PreparedStatement>()
  const statementSql = new WeakMap<object, string>()
  const onWrite = options.onWrite
  const tracking: WriteTracking | undefined = onWrite
    ? { statementSql, written: () => onWrite(recoveringSession.getBookmark()) }
    : undefined
  const maintenanceTolerantBinding = createMaintenanceTolerantDatabase(env.DB, rawStatements, createReadRetryPolicy(options), tracking)
  const recoveringSession = withD1ResetRecovery(maintenanceTolerantBinding, { consistency: options.consistency })
  const database = new Proxy(maintenanceTolerantBinding, {
    get(target, property, receiver) {
      if (property === 'prepare')
        return recoveringSession.prepare.bind(recoveringSession)
      if (property === 'batch')
        return recoveringSession.batch.bind(recoveringSession)
      const value: unknown = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  return {
    // Framework integrations need the actual binding because they create their
    // own D1 sessions. A request-scoped session is not a valid D1Database.
    bindings: env,
    database,
  }
}

interface WriteTracking {
  statementSql: WeakMap<object, string>
  written: () => void
}

function afterWrite<T>(result: Promise<T>, tracking: WriteTracking | undefined): Promise<T> {
  if (!tracking)
    return result
  return result.then((value) => {
    tracking.written()
    return value
  })
}

function createMaintenanceTolerantDatabase(
  database: D1Database,
  rawStatements: WeakMap<object, D1PreparedStatement>,
  retry: ReadRetryPolicy,
  tracking: WriteTracking | undefined,
): D1Database {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === 'withSession') {
        return (constraint?: D1SessionBookmark | D1SessionConstraint) => createMaintenanceTolerantSession(
          target.withSession(constraint),
          rawStatements,
          retry,
          tracking,
        )
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function createMaintenanceTolerantSession(
  session: D1DatabaseSession,
  rawStatements: WeakMap<object, D1PreparedStatement>,
  retry: ReadRetryPolicy,
  tracking: WriteTracking | undefined,
): D1DatabaseSession {
  return new Proxy(session, {
    get(target, property, receiver) {
      if (property === 'prepare')
        return (sql: string) => createMaintenanceTolerantStatement(target, rawStatements, sql, [], target.prepare(sql), retry, tracking)
      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          const result = target.batch(statements.map(statement => rawStatements.get(statement) ?? statement))
          const writes = statements.some((statement) => {
            const sql = tracking?.statementSql.get(statement)
            return sql === undefined || !isReplayableD1Sql(sql)
          })
          return writes ? afterWrite(result, tracking) : result
        }
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function createMaintenanceTolerantStatement(
  session: D1DatabaseSession,
  rawStatements: WeakMap<object, D1PreparedStatement>,
  sql: string,
  parameters: unknown[],
  initial: D1PreparedStatement,
  retry: ReadRetryPolicy,
  tracking: WriteTracking | undefined,
): D1PreparedStatement {
  let readAttempt = 0
  const prepare = () => {
    const statement = session.prepare(sql)
    return parameters.length > 0 ? statement.bind(...parameters) : statement
  }

  const statement = new Proxy(initial, {
    get(target, property, receiver) {
      if (property === 'bind') {
        return (...values: unknown[]) => createMaintenanceTolerantStatement(
          session,
          rawStatements,
          sql,
          values,
          target.bind(...values),
          retry,
          tracking,
        )
      }
      if (D1_TERMINAL_METHODS.has(property) && !isReplayableD1Sql(sql)) {
        const method: unknown = Reflect.get(target, property, target)
        if (typeof method !== 'function')
          return method
        return (...args: unknown[]) => afterWrite(method.apply(target, args) as Promise<unknown>, tracking)
      }
      if (D1_TERMINAL_METHODS.has(property)) {
        return (...args: unknown[]) => retryReplayableD1Read(() => {
          const statement = readAttempt++ === 0 ? target : prepare()
          const method: unknown = Reflect.get(statement, property, statement)
          if (typeof method !== 'function')
            throw new TypeError(`D1 statement method ${String(property)} is unavailable`)
          return method.apply(statement, args) as Promise<unknown>
        }, retry)
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  rawStatements.set(statement, initial)
  tracking?.statementSql.set(statement, sql)
  return statement
}

async function retryReplayableD1Read<T>(
  operation: () => Promise<T>,
  retry: ReadRetryPolicy,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const outcome: RetryOutcome<T> = await Promise.resolve()
      .then(operation)
      .then(
        value => ({ _tag: 'ok', value }),
        error => ({ _tag: 'error', error }),
      )
    if (outcome._tag === 'ok')
      return outcome.value
    if (!isRetryableD1Read(outcome.error) || attempt + 1 >= retry.maxAttempts)
      throw outcome.error

    retry.deadline ??= retry.now() + READ_RETRY_BUDGET_MS
    const remaining = retry.deadline - retry.now()
    if (remaining <= 0)
      throw outcome.error
    const delayCeiling = READ_RETRY_BASE_DELAY_MS * 2 ** attempt
    const jitter = Math.min(1, Math.max(0, retry.random()))
    await retry.sleep(Math.min(remaining, Math.round(delayCeiling * (0.5 + jitter * 0.5))))
  }
}

function isRetryableD1Read(error: unknown): boolean {
  const seen = new WeakSet<object>()
  let current = error
  while (current !== null && current !== undefined) {
    if (typeof current !== 'object')
      return isRetryableD1ReadMessage(String(current))
    if (seen.has(current))
      return false
    seen.add(current)
    if ('message' in current && typeof current.message === 'string' && isRetryableD1ReadMessage(current.message))
      return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}

function isRetryableD1ReadMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return RETRYABLE_D1_READ_MESSAGES.some(candidate => normalized.includes(candidate))
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
