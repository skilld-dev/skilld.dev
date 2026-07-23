import type {
  ForeignKeyShape,
  ForeignKeyViolation,
  SchemaObject,
  SchemaObjectType,
  SchemaSnapshot,
  SchemaVerificationResult,
} from './lib/d1-schema-verifier'
import { execFile as nodeExecFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildExpectedSchemaContract,
  verifyCfJobsPackageContract,
  verifyD1Schema,
} from './lib/d1-schema-verifier'

export interface SchemaVerifyExecFileResult {
  stdout: string
  stderr: string
}

export type SchemaVerifyExecFile = (
  file: string,
  args: string[],
) => Promise<SchemaVerifyExecFileResult>

export interface D1SchemaVerifyDependencies {
  execFile: SchemaVerifyExecFile
  wranglerPath?: string
  migrationsDir?: string
  packageJsonPath?: string
  distributedSchemaPath?: string
}

export type D1SchemaVerifyCliResult
  = | { _tag: 'refused', reason: 'remote_dry_run_required' }
    | { _tag: 'completed', verification: SchemaVerificationResult }

export type ReadOnlyQueryResult
  = | { _tag: 'allowed' }
    | { _tag: 'rejected', reason: string }

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const databaseName = 'skilld-db'

const inspectionQueries = {
  ledger: `
    SELECT name
    FROM d1_migrations
    ORDER BY id
  `,
  objects: `
    SELECT type, name, tbl_name AS table_name, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
      AND sql IS NOT NULL
    ORDER BY type, name
  `,
  foreignKeys: `
    SELECT
      m.name AS table_name,
      fk."table" AS referenced_table,
      fk."from" AS from_column,
      fk."to" AS to_column,
      fk.on_update,
      fk.on_delete,
      fk.match
    FROM sqlite_master AS m
    JOIN pragma_foreign_key_list(m.name) AS fk
    WHERE m.type = 'table'
      AND m.name NOT LIKE 'sqlite_%'
    ORDER BY m.name, fk.id, fk.seq
  `,
  foreignKeyCheck: `PRAGMA foreign_key_check`,
} as const

export function assertReadOnlyInspectionQuery(sql: string): ReadOnlyQueryResult {
  const trimmed = sql.trim().replace(/;\s*$/, '')
  if (!trimmed)
    return { _tag: 'rejected', reason: 'empty_query' }
  if (trimmed.includes(';'))
    return { _tag: 'rejected', reason: 'multiple_statements' }
  if (/--|\/\*/.test(trimmed))
    return { _tag: 'rejected', reason: 'comments_not_allowed' }
  if (/^PRAGMA\s+foreign_key_check(?:\s*\(\s*\))?$/i.test(trimmed))
    return { _tag: 'allowed' }
  if (!/^SELECT\b/i.test(trimmed))
    return { _tag: 'rejected', reason: 'select_or_foreign_key_check_required' }

  const withoutStrings = trimmed.replace(/'(?:''|[^'])*'/g, `''`)
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|DETACH|VACUUM|REINDEX|PRAGMA)\b/i.test(withoutStrings))
    return { _tag: 'rejected', reason: 'write_keyword' }
  const sources = [...withoutStrings.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]\w*(?:\s*\([^)]*\))?)/gi)]
    .map(match => match[1]!.replace(/\s+/g, ''))
  if (!sources.length)
    return { _tag: 'rejected', reason: 'approved_source_required' }
  const allowedSources = new Set([
    'sqlite_master',
    'sqlite_schema',
    'd1_migrations',
    'pragma_foreign_key_list(m.name)',
  ])
  const rejectedSource = sources.find(source => !allowedSources.has(source.toLowerCase()))
  return rejectedSource
    ? { _tag: 'rejected', reason: `source_not_allowed:${rejectedSource}` }
    : { _tag: 'allowed' }
}

export async function runD1SchemaVerifyCli(
  args: string[],
  deps: D1SchemaVerifyDependencies,
): Promise<D1SchemaVerifyCliResult> {
  if (args.length !== 2 || args[0] !== '--remote' || args[1] !== '--dry-run') {
    return {
      _tag: 'refused',
      reason: 'remote_dry_run_required',
    }
  }

  const packageJsonPath = deps.packageJsonPath
    ?? resolve(projectRoot, 'node_modules/nuxt-cf-jobs/package.json')
  const distributedSchemaPath = deps.distributedSchemaPath
    ?? resolve(projectRoot, 'node_modules/nuxt-cf-jobs/dist/runtime/server/d1.js')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown }
  const packageContract = verifyCfJobsPackageContract({
    installedVersion: typeof packageJson.version === 'string' ? packageJson.version : 'invalid',
    distributedSchemaSource: readFileSync(distributedSchemaPath, 'utf8'),
  })
  if (packageContract._tag === 'fail') {
    return {
      _tag: 'completed',
      verification: {
        _tag: 'fail',
        issues: packageContract.issues,
      },
    }
  }

  const execute = async (sql: string): Promise<unknown[]> => {
    const policy = assertReadOnlyInspectionQuery(sql)
    if (policy._tag === 'rejected')
      throw new Error(`Refused D1 inspection query: ${policy.reason}`)
    const result = await deps.execFile(
      deps.wranglerPath ?? resolve(projectRoot, 'node_modules/.bin/wrangler'),
      [
        'd1',
        'execute',
        databaseName,
        '--remote',
        '--json',
        '--config',
        resolve(projectRoot, 'wrangler.jsonc'),
        '--command',
        sql,
      ],
    )
    return parseWranglerD1Rows(result.stdout)
  }

  const ledger = parseLedgerRows(await execute(inspectionQueries.ledger))
  const objects = parseObjectRows(await execute(inspectionQueries.objects))
  const foreignKeys = parseForeignKeyRows(await execute(inspectionQueries.foreignKeys))
  const foreignKeyViolations = parseForeignKeyCheckRows(
    await execute(inspectionQueries.foreignKeyCheck),
  )
  const actual: SchemaSnapshot = {
    migrationLedger: ledger,
    objects,
    foreignKeys,
    foreignKeyViolations,
  }
  const contract = buildExpectedSchemaContract(
    deps.migrationsDir ?? resolve(projectRoot, 'migrations'),
  )
  return {
    _tag: 'completed',
    verification: verifyD1Schema(contract, actual),
  }
}

function parseWranglerD1Rows(stdout: string): unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout) as unknown
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Malformed Wrangler D1 JSON: ${detail}`)
  }
  if (!Array.isArray(parsed)
    || parsed.length !== 1
    || !isRecord(parsed[0])
    || parsed[0].success !== true
    || !Array.isArray(parsed[0].results)) {
    throw new Error('Malformed Wrangler D1 JSON: expected one successful result set')
  }
  return parsed[0].results
}

function parseLedgerRows(rows: unknown[]): string[] {
  return rows.map((row) => {
    if (!isRecord(row) || typeof row.name !== 'string')
      throw new Error('Malformed Wrangler D1 JSON: invalid migration ledger row')
    return row.name
  })
}

function parseObjectRows(rows: unknown[]): SchemaObject[] {
  return rows.map((row) => {
    if (!isRecord(row)
      || !isSchemaObjectType(row.type)
      || typeof row.name !== 'string'
      || typeof row.table_name !== 'string'
      || typeof row.sql !== 'string') {
      throw new Error('Malformed Wrangler D1 JSON: invalid sqlite_master row')
    }
    return {
      type: row.type,
      name: row.name,
      tableName: row.table_name,
      sql: row.sql,
    }
  })
}

function parseForeignKeyRows(rows: unknown[]): ForeignKeyShape[] {
  return rows.map((row) => {
    if (!isRecord(row)
      || typeof row.table_name !== 'string'
      || typeof row.referenced_table !== 'string'
      || typeof row.from_column !== 'string'
      || typeof row.to_column !== 'string'
      || typeof row.on_update !== 'string'
      || typeof row.on_delete !== 'string'
      || typeof row.match !== 'string') {
      throw new Error('Malformed Wrangler D1 JSON: invalid foreign-key row')
    }
    return {
      tableName: row.table_name,
      referencedTable: row.referenced_table,
      from: row.from_column,
      to: row.to_column,
      onUpdate: row.on_update,
      onDelete: row.on_delete,
      match: row.match,
    }
  })
}

function parseForeignKeyCheckRows(rows: unknown[]): ForeignKeyViolation[] {
  return rows.map((row) => {
    if (!isRecord(row)
      || typeof row.table !== 'string'
      || (row.rowid !== null && !Number.isSafeInteger(row.rowid))
      || typeof row.parent !== 'string'
      || !Number.isSafeInteger(row.fkid)) {
      throw new Error('Malformed Wrangler D1 JSON: invalid foreign_key_check row')
    }
    return {
      tableName: row.table,
      rowId: row.rowid as number | null,
      parentTable: row.parent,
      foreignKeyId: row.fkid as number,
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSchemaObjectType(value: unknown): value is SchemaObjectType {
  return value === 'table' || value === 'index' || value === 'trigger' || value === 'view'
}

const execFile: SchemaVerifyExecFile = (file, args) => new Promise((resolvePromise, rejectPromise) => {
  nodeExecFile(file, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }, (error, stdout, stderr) => {
    if (error) {
      rejectPromise(new Error(`Wrangler schema inspection failed: ${stderr || error.message}`))
      return
    }
    resolvePromise({ stdout, stderr })
  })
})

async function main(): Promise<void> {
  const result = await runD1SchemaVerifyCli(process.argv.slice(2), { execFile })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result._tag === 'refused'
    || (result._tag === 'completed' && result.verification._tag === 'fail')) {
    process.exitCode = 1
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? ''))
  await main()
