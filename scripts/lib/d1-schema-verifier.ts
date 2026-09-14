import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'

export type SchemaObjectType = 'table' | 'index' | 'trigger' | 'view'

export interface SchemaObject {
  type: SchemaObjectType
  name: string
  tableName: string
  sql: string
}

export interface ForeignKeyShape {
  tableName: string
  referencedTable: string
  from: string
  to: string
  onUpdate: string
  onDelete: string
  match: string
}

export interface ForeignKeyViolation {
  tableName: string
  rowId: number | null
  parentTable: string
  foreignKeyId: number
}

export interface RequiredSchemaIndex {
  name: string
  tableName: string
  sql: string
  distributedSql: string
}

export interface SchemaContract {
  migrationNames: string[]
  objects: SchemaObject[]
  foreignKeys: ForeignKeyShape[]
  requiredIndexes: RequiredSchemaIndex[]
}

export interface SchemaSnapshot {
  migrationLedger: string[]
  objects: SchemaObject[]
  foreignKeys: ForeignKeyShape[]
  foreignKeyViolations: ForeignKeyViolation[]
}

export interface IgnoredExpectedObject {
  name: string
  reason: 'historical_drop'
}

type PackageContractIssue
  = {
    _tag: 'package_version_mismatch'
    expected: string
    actual: string
  }
  | {
    _tag: 'package_index_missing'
    name: string
  }
  | {
    _tag: 'package_index_sql_mismatch'
    name: string
    expectedSql: string
    actualSql: string
  }

export type SchemaVerificationIssue
  = | { _tag: 'migration_missing', name: string }
    | { _tag: 'migration_extra', name: string }
    | { _tag: 'migration_duplicate', name: string, count: number }
    | { _tag: 'migration_order_mismatch', expected: string[], actual: string[] }
    | {
      _tag: 'object_missing'
      type: SchemaObjectType
      name: string
      ledgerState: 'complete' | 'incomplete'
    }
    | {
      _tag: 'object_sql_mismatch'
      type: SchemaObjectType
      name: string
      expectedSql: string
      actualSql: string
    }
    | { _tag: 'ignored_object_unknown', name: string }
    | {
      _tag: 'foreign_key_mismatch'
      tableName: string
      expected: ForeignKeyShape[]
      actual: ForeignKeyShape[]
    }
    | {
      _tag: 'foreign_key_violation'
      tableName: string
      rowId: number | null
      parentTable: string
      foreignKeyId: number
    }
    | { _tag: 'required_index_missing', name: string, tableName: string }
    | {
      _tag: 'required_index_sql_mismatch'
      name: string
      expectedSql: string
      actualSql: string
    }
    | PackageContractIssue

export type SchemaVerificationResult
  = {
    _tag: 'pass'
    comparedMigrations: number
    comparedObjects: number
    comparedForeignKeys: number
  }
  | {
    _tag: 'fail'
    issues: SchemaVerificationIssue[]
  }

export type CfJobsPackageVerificationResult
  = | { _tag: 'pass' }
    | { _tag: 'fail', issues: PackageContractIssue[] }

export const CF_JOBS_SCHEMA_CONTRACT = {
  // The 0.2.4 distributed schema preserves these five indexes and predicates.
  version: '0.2.4',
  indexes: [
    {
      name: 'idx_jobs_dispatchable',
      tableName: 'jobs',
      sql: 'CREATE INDEX idx_jobs_dispatchable ON jobs(available_at) WHERE published_at IS NULL AND reserved_at IS NULL AND completed_at IS NULL AND failed_at IS NULL',
      distributedSql: 'CREATE INDEX IF NOT EXISTS idx_jobs_dispatchable ON jobs (available_at) WHERE published_at IS NULL AND reserved_at IS NULL AND completed_at IS NULL AND failed_at IS NULL',
    },
    {
      name: 'idx_jobs_stale_reserved',
      tableName: 'jobs',
      sql: 'CREATE INDEX idx_jobs_stale_reserved ON jobs(reserved_at) WHERE reserved_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL',
      distributedSql: 'CREATE INDEX IF NOT EXISTS idx_jobs_stale_reserved ON jobs (reserved_at) WHERE reserved_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL',
    },
    {
      name: 'idx_jobs_active',
      tableName: 'jobs',
      sql: 'CREATE INDEX idx_jobs_active ON jobs(created_at) WHERE completed_at IS NULL AND failed_at IS NULL',
      distributedSql: 'CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs (created_at) WHERE completed_at IS NULL AND failed_at IS NULL',
    },
    {
      name: 'idx_failed_jobs_site_failed_at',
      tableName: 'failed_jobs',
      sql: 'CREATE INDEX idx_failed_jobs_site_failed_at ON failed_jobs(site_id, failed_at)',
      distributedSql: 'CREATE INDEX IF NOT EXISTS idx_failed_jobs_site_failed_at ON failed_jobs (site_id, failed_at)',
    },
    {
      name: 'idx_failed_jobs_batch_failed_at',
      tableName: 'failed_jobs',
      sql: 'CREATE INDEX idx_failed_jobs_batch_failed_at ON failed_jobs(batch_id, failed_at)',
      distributedSql: 'CREATE INDEX IF NOT EXISTS idx_failed_jobs_batch_failed_at ON failed_jobs (batch_id, failed_at)',
    },
  ] satisfies RequiredSchemaIndex[],
} as const

export function normalizeSchemaSql(sql: string): string {
  const source = sql.trim().replace(/;+\s*$/, '')
  let normalized = ''
  let quote: '\'' | '"' | '`' | ']' | null = null
  let whitespacePending = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!
    if (quote) {
      normalized += char
      if ((quote === ']' && char === ']') || (quote !== ']' && char === quote)) {
        if (quote !== ']' && source[index + 1] === quote) {
          normalized += source[index + 1]
          index += 1
        }
        else {
          quote = null
        }
      }
      continue
    }
    if (char === '\'' || char === '"' || char === '`' || char === '[') {
      if (whitespacePending && normalized && !endsWithPunctuation(normalized))
        normalized += ' '
      whitespacePending = false
      quote = char === '[' ? ']' : char
      normalized += char
      continue
    }
    if (/\s/.test(char)) {
      whitespacePending = true
      continue
    }
    if (/[(),=<>+\-*/]/.test(char)) {
      normalized = normalized.trimEnd()
      normalized += char
      whitespacePending = false
      continue
    }
    if (whitespacePending && normalized && !endsWithPunctuation(normalized))
      normalized += ' '
    whitespacePending = false
    normalized += char.toLowerCase()
  }
  return normalized.trim()
}

export function buildExpectedSchemaContract(migrationsDir: string): SchemaContract {
  const migrationNames = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
  const sqlite = new Database(':memory:')
  try {
    sqlite.pragma('foreign_keys = ON')
    for (const migration of migrationNames)
      sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))
    const snapshot = snapshotSqliteDatabase(sqlite, migrationNames)
    return {
      migrationNames,
      objects: snapshot.objects,
      foreignKeys: snapshot.foreignKeys,
      requiredIndexes: CF_JOBS_SCHEMA_CONTRACT.indexes.map(index => ({ ...index })),
    }
  }
  finally {
    sqlite.close()
  }
}

export function snapshotSqliteDatabase(
  sqlite: Database.Database,
  migrationLedger: string[],
): SchemaSnapshot {
  const objects = (sqlite.prepare(
    `SELECT type, name, tbl_name AS table_name, sql
     FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%'
       AND sql IS NOT NULL
     ORDER BY type, name`,
  ).all() as Array<{
    type: SchemaObjectType
    name: string
    table_name: string
    sql: string
  }>).map(row => ({
    type: row.type,
    name: row.name,
    tableName: row.table_name,
    sql: row.sql,
  }))
  const foreignKeys = objects
    .filter(object => object.type === 'table')
    .flatMap(object =>
      (sqlite.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(object.name)})`).all() as Array<{
        table: string
        from: string
        to: string
        on_update: string
        on_delete: string
        match: string
      }>).map(row => ({
        tableName: object.name,
        referencedTable: row.table,
        from: row.from,
        to: row.to,
        onUpdate: row.on_update,
        onDelete: row.on_delete,
        match: row.match,
      })))
    .sort(compareForeignKeys)
  const foreignKeyViolations = (sqlite.prepare(`PRAGMA foreign_key_check`).all() as Array<{
    table: string
    rowid: number | null
    parent: string
    fkid: number
  }>).map(row => ({
    tableName: row.table,
    rowId: row.rowid,
    parentTable: row.parent,
    foreignKeyId: row.fkid,
  }))
  return {
    migrationLedger: [...migrationLedger],
    objects,
    foreignKeys,
    foreignKeyViolations,
  }
}

export function verifyD1Schema(
  contract: SchemaContract,
  actual: SchemaSnapshot,
  options: {
    ignoredExpectedObjects?: readonly IgnoredExpectedObject[]
    allowHistoricalMigrationOrder?: boolean
  } = {},
): SchemaVerificationResult {
  const issues: SchemaVerificationIssue[] = []
  const ignored = new Set(
    (options.ignoredExpectedObjects ?? []).map(object => object.name),
  )
  const expectedNames = new Set(contract.objects.map(object => object.name))
  for (const name of ignored) {
    if (!expectedNames.has(name))
      issues.push({ _tag: 'ignored_object_unknown', name })
  }

  const actualMigrationCounts = countNames(actual.migrationLedger)
  for (const name of contract.migrationNames) {
    if (!actualMigrationCounts.has(name))
      issues.push({ _tag: 'migration_missing', name })
  }
  const expectedMigrations = new Set(contract.migrationNames)
  for (const [name, count] of actualMigrationCounts) {
    if (!expectedMigrations.has(name))
      issues.push({ _tag: 'migration_extra', name })
    if (count > 1)
      issues.push({ _tag: 'migration_duplicate', name, count })
  }
  const ledgerMatches = arraysEqual(contract.migrationNames, actual.migrationLedger)
  if (!ledgerMatches && !options.allowHistoricalMigrationOrder) {
    issues.push({
      _tag: 'migration_order_mismatch',
      expected: [...contract.migrationNames],
      actual: [...actual.migrationLedger],
    })
  }

  const requiredIndexNames = new Set(contract.requiredIndexes.map(index => index.name))
  const actualObjects = new Map(actual.objects.map(object => [objectKey(object), object]))
  let comparedObjects = 0
  for (const expected of contract.objects) {
    if (ignored.has(expected.name) || requiredIndexNames.has(expected.name))
      continue
    const observed = actualObjects.get(objectKey(expected))
    if (!observed) {
      issues.push({
        _tag: 'object_missing',
        type: expected.type,
        name: expected.name,
        ledgerState: ledgerMatches ? 'complete' : 'incomplete',
      })
      continue
    }
    comparedObjects += 1
    const expectedSql = normalizeSchemaSql(expected.sql)
    const actualSql = normalizeSchemaSql(observed.sql)
    if (expectedSql !== actualSql) {
      issues.push({
        _tag: 'object_sql_mismatch',
        type: expected.type,
        name: expected.name,
        expectedSql,
        actualSql,
      })
    }
  }

  for (const required of contract.requiredIndexes) {
    const observed = actualObjects.get(`index:${required.name}`)
    if (!observed) {
      issues.push({
        _tag: 'required_index_missing',
        name: required.name,
        tableName: required.tableName,
      })
      continue
    }
    comparedObjects += 1
    const expectedSql = normalizeSchemaSql(required.sql)
    const actualSql = normalizeSchemaSql(observed.sql)
    if (expectedSql !== actualSql) {
      issues.push({
        _tag: 'required_index_sql_mismatch',
        name: required.name,
        expectedSql,
        actualSql,
      })
    }
  }

  const expectedForeignKeys = groupForeignKeys(contract.foreignKeys)
  const actualForeignKeys = groupForeignKeys(actual.foreignKeys)
  let comparedForeignKeys = 0
  for (const expectedTable of contract.objects.filter(object => object.type === 'table')) {
    if (ignored.has(expectedTable.name))
      continue
    const expected = expectedForeignKeys.get(expectedTable.name) ?? []
    const observed = actualForeignKeys.get(expectedTable.name) ?? []
    comparedForeignKeys += expected.length
    if (!arraysEqual(
      expected.map(serializeForeignKey),
      observed.map(serializeForeignKey),
    )) {
      issues.push({
        _tag: 'foreign_key_mismatch',
        tableName: expectedTable.name,
        expected,
        actual: observed,
      })
    }
  }

  for (const violation of actual.foreignKeyViolations) {
    issues.push({
      _tag: 'foreign_key_violation',
      ...violation,
    })
  }

  return issues.length
    ? { _tag: 'fail', issues }
    : {
        _tag: 'pass',
        comparedMigrations: contract.migrationNames.length,
        comparedObjects,
        comparedForeignKeys,
      }
}

export function verifyCfJobsPackageContract(input: {
  installedVersion: string
  distributedSchemaSource: string
}): CfJobsPackageVerificationResult {
  const issues: PackageContractIssue[] = []
  if (input.installedVersion !== CF_JOBS_SCHEMA_CONTRACT.version) {
    issues.push({
      _tag: 'package_version_mismatch',
      expected: CF_JOBS_SCHEMA_CONTRACT.version,
      actual: input.installedVersion,
    })
  }
  const distributedStatements = extractJavaScriptStrings(input.distributedSchemaSource)
    .filter(statement => normalizeSchemaSql(statement).startsWith('create index'))
  for (const required of CF_JOBS_SCHEMA_CONTRACT.indexes) {
    const actual = distributedStatements.find(statement =>
      normalizeSchemaSql(statement).includes(`index if not exists ${required.name} `))
    if (!actual) {
      issues.push({ _tag: 'package_index_missing', name: required.name })
      continue
    }
    const expectedSql = normalizeSchemaSql(required.distributedSql)
    const actualSql = normalizeSchemaSql(actual)
    if (expectedSql !== actualSql) {
      issues.push({
        _tag: 'package_index_sql_mismatch',
        name: required.name,
        expectedSql,
        actualSql,
      })
    }
  }
  return issues.length ? { _tag: 'fail', issues } : { _tag: 'pass' }
}

function endsWithPunctuation(value: string): boolean {
  return /[(),=<>+\-*/]$/.test(value)
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function compareForeignKeys(left: ForeignKeyShape, right: ForeignKeyShape): number {
  return serializeForeignKey(left).localeCompare(serializeForeignKey(right))
}

function serializeForeignKey(foreignKey: ForeignKeyShape): string {
  return [
    foreignKey.tableName,
    foreignKey.referencedTable,
    foreignKey.from,
    foreignKey.to,
    foreignKey.onUpdate,
    foreignKey.onDelete,
    foreignKey.match,
  ].join('\u0000')
}

function groupForeignKeys(
  foreignKeys: ForeignKeyShape[],
): Map<string, ForeignKeyShape[]> {
  const grouped = new Map<string, ForeignKeyShape[]>()
  for (const foreignKey of foreignKeys) {
    const existing = grouped.get(foreignKey.tableName) ?? []
    existing.push(foreignKey)
    grouped.set(foreignKey.tableName, existing)
  }
  for (const rows of grouped.values())
    rows.sort(compareForeignKeys)
  return grouped
}

function countNames(names: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const name of names)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  return counts
}

function objectKey(object: Pick<SchemaObject, 'type' | 'name'>): string {
  return `${object.type}:${object.name}`
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function extractJavaScriptStrings(source: string): string[] {
  const values: string[] = []
  for (const match of source.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
    try {
      values.push(JSON.parse(`"${match[1]}"`) as string)
    }
    catch {
      // Non-JSON JavaScript string escapes cannot be schema statements.
    }
  }
  return values
}
