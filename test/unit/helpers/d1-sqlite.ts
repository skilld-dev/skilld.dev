import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * A D1Database facade over `node:sqlite`, so tests exercise the real SQL
 * instead of a hand-written mock that agrees with whatever the code does.
 *
 * Only the surface the code under test uses is implemented: prepare/bind with
 * `?N` placeholders, first, all, run, and batch. Anything else throws loudly
 * rather than returning a plausible empty value.
 */
/** D1's hard limit on bound parameters per statement. */
export const D1_MAX_BOUND_PARAMS = 100

export interface SqliteD1 {
  db: D1Database
  raw: DatabaseSync
  close: () => void
}

/**
 * Every migration, in order.
 *
 * For tests spanning tables that different migrations created. Listing a
 * subset by hand works until a query joins one table too many, and then the
 * failure is `no such table` in a test that was meant to be about ranking.
 * `migrations-bootstrap.test.ts` already proves the whole chain applies to an
 * empty database, so replaying it is cheap and cannot drift.
 */
export function allMigrations(): string[] {
  return readdirSync('migrations')
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => `migrations/${name}`)
}

export function createSqliteD1(
  migrationPaths: string[],
  options: { maximumQueries?: number } = {},
): SqliteD1 {
  const raw = new DatabaseSync(':memory:')
  let queryCount = 0
  for (const path of migrationPaths)
    raw.exec(readFileSync(path, 'utf8'))

  /**
   * D1 rejects a statement with more than 100 bound parameters. SQLite itself
   * allows 32,766, so without this check the harness happily runs queries that
   * fail in production. A `(owner, repo) IN (VALUES ...)` list of 96 repos
   * passed every test here and then threw
   * "variable number must be between ?1 and ?100" on the first real request.
   */
  function statement(sql: string, values: unknown[]) {
    if (values.length > D1_MAX_BOUND_PARAMS) {
      throw new Error(
        `variable number must be between ?1 and ?${D1_MAX_BOUND_PARAMS}: `
        + `statement bound ${values.length} parameters`,
      )
    }
    const bound = values.map(v => (v === undefined ? null : v)) as never[]
    return {
      async first<T>(): Promise<T | null> {
        countQueries(1)
        return (raw.prepare(sql).get(...bound) as T | undefined) ?? null
      },
      async all<T>(): Promise<{ results: T[] }> {
        countQueries(1)
        return { results: raw.prepare(sql).all(...bound) as T[] }
      },
      async run() {
        countQueries(1)
        const result = raw.prepare(sql).run(...bound)
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
      },
      // Carried so batch() can replay the statement it was handed.
      _sql: sql,
      _values: bound,
    }
  }

  const db = {
    prepare(sql: string) {
      return {
        bind: (...values: unknown[]) => statement(sql, values),
        ...statement(sql, []),
      }
    },
    async batch(statements: Array<{ _sql: string, _values: never[] }>) {
      countQueries(statements.length)
      // D1 runs a batch in an implicit transaction; matching that here means a
      // test sees the same all-or-nothing behaviour as production.
      raw.exec('BEGIN')
      try {
        const out = statements.map((s) => {
          const result = raw.prepare(s._sql).run(...s._values)
          return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
        })
        raw.exec('COMMIT')
        return out
      }
      catch (error) {
        raw.exec('ROLLBACK')
        throw error
      }
    },
  } as unknown as D1Database

  function countQueries(count: number): void {
    queryCount += count
    if (options.maximumQueries !== undefined && queryCount > options.maximumQueries)
      throw new Error(`D1 query budget exceeded: ${queryCount} > ${options.maximumQueries}`)
  }

  return { db, raw, close: () => raw.close() }
}
