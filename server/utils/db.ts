import type { H3Event } from 'h3'
import { isReplayableD1Sql, withD1ResetRecovery } from '@harlan-zw/nuxt-cloudflare/d1'

const D1_TERMINAL_METHODS = new Set<PropertyKey>(['first', 'run', 'all', 'raw'])
const LONG_RUNNING_IMPORT = 'currently processing a long-running import'

interface D1ImportRecoveryOptions {
  maxAttempts?: number
  random?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

export interface PlatformD1 {
  bindings: Cloudflare.Env
  database: D1Database
}

type RetryOutcome<T> = { _tag: 'ok', value: T } | { _tag: 'error', error: unknown }

export function createPlatformD1(
  env: Cloudflare.Env,
  options: D1ImportRecoveryOptions = {},
): PlatformD1 {
  const rawStatements = new WeakMap<object, D1PreparedStatement>()
  const importTolerantBinding = createImportTolerantDatabase(env.DB, rawStatements, options)
  const recoveringSession = withD1ResetRecovery(importTolerantBinding)
  const database = new Proxy(importTolerantBinding, {
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

function createImportTolerantDatabase(
  database: D1Database,
  rawStatements: WeakMap<object, D1PreparedStatement>,
  options: D1ImportRecoveryOptions,
): D1Database {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === 'withSession') {
        return (constraint?: D1SessionBookmark | D1SessionConstraint) => createImportTolerantSession(
          target.withSession(constraint),
          rawStatements,
          options,
        )
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function createImportTolerantSession(
  session: D1DatabaseSession,
  rawStatements: WeakMap<object, D1PreparedStatement>,
  options: D1ImportRecoveryOptions,
): D1DatabaseSession {
  return new Proxy(session, {
    get(target, property, receiver) {
      if (property === 'prepare')
        return (sql: string) => createImportTolerantStatement(target, rawStatements, sql, [], target.prepare(sql), options)
      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) => target.batch(
          statements.map(statement => rawStatements.get(statement) ?? statement),
        )
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function createImportTolerantStatement(
  session: D1DatabaseSession,
  rawStatements: WeakMap<object, D1PreparedStatement>,
  sql: string,
  parameters: unknown[],
  initial: D1PreparedStatement,
  options: D1ImportRecoveryOptions,
): D1PreparedStatement {
  let readAttempt = 0
  const prepare = () => {
    const statement = session.prepare(sql)
    return parameters.length > 0 ? statement.bind(...parameters) : statement
  }

  const statement = new Proxy(initial, {
    get(target, property, receiver) {
      if (property === 'bind') {
        return (...values: unknown[]) => createImportTolerantStatement(
          session,
          rawStatements,
          sql,
          values,
          target.bind(...values),
          options,
        )
      }
      if (D1_TERMINAL_METHODS.has(property) && isReplayableD1Sql(sql)) {
        return (...args: unknown[]) => retryD1ImportRead(() => {
          const statement = readAttempt++ === 0 ? target : prepare()
          const method: unknown = Reflect.get(statement, property, statement)
          if (typeof method !== 'function')
            throw new TypeError(`D1 statement method ${String(property)} is unavailable`)
          return method.apply(statement, args) as Promise<unknown>
        }, options)
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  rawStatements.set(statement, initial)
  return statement
}

async function retryD1ImportRead<T>(
  operation: () => Promise<T>,
  options: D1ImportRecoveryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 4))
  const random = options.random ?? Math.random
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds)))

  for (let attempt = 0; ; attempt++) {
    const outcome: RetryOutcome<T> = await Promise.resolve()
      .then(operation)
      .then(
        value => ({ _tag: 'ok', value }),
        error => ({ _tag: 'error', error }),
      )
    if (outcome._tag === 'ok')
      return outcome.value
    if (!isLongRunningD1Import(outcome.error) || attempt + 1 >= maxAttempts)
      throw outcome.error

    const delayCeiling = 60 * 2 ** attempt
    const jitter = Math.min(1, Math.max(0, random()))
    await sleep(Math.round(delayCeiling * (0.5 + jitter * 0.5)))
  }
}

function isLongRunningD1Import(error: unknown): boolean {
  const seen = new WeakSet<object>()
  let current = error
  while (current !== null && current !== undefined) {
    if (typeof current !== 'object')
      return String(current).toLowerCase().includes(LONG_RUNNING_IMPORT)
    if (seen.has(current))
      return false
    seen.add(current)
    if ('message' in current && typeof current.message === 'string' && current.message.toLowerCase().includes(LONG_RUNNING_IMPORT))
      return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
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
