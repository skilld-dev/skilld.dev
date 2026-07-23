import type {
  SchemaContract,
  SchemaSnapshot,
} from '../../scripts/lib/d1-schema-verifier'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildExpectedSchemaContract,
  CF_JOBS_SCHEMA_CONTRACT,
  normalizeSchemaSql,
  verifyCfJobsPackageContract,
  verifyD1Schema,
} from '../../scripts/lib/d1-schema-verifier'

const migrationsDir = resolve(process.cwd(), 'migrations')

describe('d1 schema verifier', () => {
  it('fails when the ledger reports 0011 but install_events is missing', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const actual = snapshotFromContract(contract, {
      objects: contract.objects.filter(object => object.name !== 'install_events'),
    })

    const result = verifyD1Schema(contract, actual)

    expect(result).toMatchObject({
      _tag: 'fail',
      issues: expect.arrayContaining([
        expect.objectContaining({
          _tag: 'object_missing',
          name: 'install_events',
          ledgerState: 'complete',
        }),
      ]),
    })
  })

  it.each(CF_JOBS_SCHEMA_CONTRACT.indexes)(
    'fails when package-required index $name is missing',
    (requiredIndex) => {
      const contract = buildExpectedSchemaContract(migrationsDir)
      const actual = snapshotFromContract(contract, {
        objects: contract.objects.filter(object => object.name !== requiredIndex.name),
      })

      expect(verifyD1Schema(contract, actual)).toMatchObject({
        _tag: 'fail',
        issues: expect.arrayContaining([
          expect.objectContaining({
            _tag: 'required_index_missing',
            name: requiredIndex.name,
          }),
        ]),
      })
    },
  )

  it('fails when any expected migration index is missing', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const actual = snapshotFromContract(contract, {
      objects: contract.objects.filter(object => object.name !== 'idx_install_events_recent'),
    })

    expect(verifyD1Schema(contract, actual)).toMatchObject({
      _tag: 'fail',
      issues: expect.arrayContaining([
        expect.objectContaining({
          _tag: 'object_missing',
          name: 'idx_install_events_recent',
        }),
      ]),
    })
  })

  it('fails when normalized SQL shape differs', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const actual = snapshotFromContract(contract, {
      objects: contract.objects.map(object => object.name === 'install_events'
        ? { ...object, sql: `${object.sql} STRICT` }
        : object),
    })

    expect(verifyD1Schema(contract, actual)).toMatchObject({
      _tag: 'fail',
      issues: expect.arrayContaining([
        expect.objectContaining({
          _tag: 'object_sql_mismatch',
          name: 'install_events',
        }),
      ]),
    })
  })

  it('allows a missing historical object only through an explicit named allow-list', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const ignoredName = 'idx_activity_recent'
    const actual = snapshotFromContract(contract, {
      objects: contract.objects.filter(object => object.name !== ignoredName),
    })

    expect(verifyD1Schema(contract, actual)).toMatchObject({ _tag: 'fail' })
    expect(verifyD1Schema(contract, actual, {
      ignoredExpectedObjects: [{
        name: ignoredName,
        reason: 'historical_drop',
      }],
    })).toMatchObject({ _tag: 'pass' })
  })

  it('ignores unrelated runtime-owned extra objects', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const actual = snapshotFromContract(contract, {
      objects: [
        ...contract.objects,
        {
          type: 'table',
          name: '_runtime_owned',
          tableName: '_runtime_owned',
          sql: 'CREATE TABLE _runtime_owned (id INTEGER PRIMARY KEY)',
        },
      ],
    })

    expect(verifyD1Schema(contract, actual)).toMatchObject({ _tag: 'pass' })
  })

  it('fails when a foreign-key shape drifts', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const jobsFk = contract.foreignKeys.find(foreignKey =>
      foreignKey.tableName === 'jobs' && foreignKey.from === 'batch_id')
    expect(jobsFk).toBeDefined()
    const actual = snapshotFromContract(contract, {
      foreignKeys: contract.foreignKeys.map(foreignKey => foreignKey === jobsFk
        ? {
            ...foreignKey,
            referencedTable: 'wrong_batches',
            onDelete: 'CASCADE',
          }
        : foreignKey),
    })

    expect(verifyD1Schema(contract, actual)).toMatchObject({
      _tag: 'fail',
      issues: expect.arrayContaining([
        expect.objectContaining({
          _tag: 'foreign_key_mismatch',
          tableName: 'jobs',
        }),
      ]),
    })
  })

  it('fails when foreign_key_check reports a row', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const actual = snapshotFromContract(contract, {
      foreignKeyViolations: [{
        tableName: 'jobs',
        rowId: 7,
        parentTable: 'job_batches',
        foreignKeyId: 0,
      }],
    })

    expect(verifyD1Schema(contract, actual)).toMatchObject({
      _tag: 'fail',
      issues: expect.arrayContaining([
        expect.objectContaining({
          _tag: 'foreign_key_violation',
          tableName: 'jobs',
          rowId: 7,
        }),
      ]),
    })
  })

  it('reports missing, extra, duplicate, and out-of-order ledger entries explicitly', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)
    const [first, second, ...rest] = contract.migrationNames
    const actual = snapshotFromContract(contract, {
      migrationLedger: [second!, first!, ...rest.slice(0, -1), '9999_extra.sql', second!],
    })
    const result = verifyD1Schema(contract, actual)

    expect(result).toMatchObject({
      _tag: 'fail',
      issues: expect.arrayContaining([
        expect.objectContaining({
          _tag: 'migration_missing',
          name: contract.migrationNames.at(-1),
        }),
        expect.objectContaining({
          _tag: 'migration_extra',
          name: '9999_extra.sql',
        }),
        expect.objectContaining({
          _tag: 'migration_duplicate',
          name: second,
        }),
        expect.objectContaining({
          _tag: 'migration_order_mismatch',
        }),
      ]),
    })
  })

  it('passes a clean full replay with an exact ledger', () => {
    const contract = buildExpectedSchemaContract(migrationsDir)

    expect(verifyD1Schema(contract, snapshotFromContract(contract))).toEqual({
      _tag: 'pass',
      comparedMigrations: contract.migrationNames.length,
      comparedObjects: contract.objects.length,
      comparedForeignKeys: contract.foreignKeys.length,
    })
  })

  it('normalizes whitespace and trailing semicolons but preserves predicates', () => {
    const spaced = `
      CREATE INDEX idx_jobs_dispatchable
      ON jobs (available_at)
      WHERE reserved_at IS NULL
        AND completed_at IS NULL
        AND failed_at IS NULL;
    `
    const compact = 'create index idx_jobs_dispatchable on jobs(available_at) where reserved_at is null and completed_at is null and failed_at is null'
    const changed = compact.replace('failed_at is null', 'failed_at is not null')

    expect(normalizeSchemaSql(spaced)).toBe(normalizeSchemaSql(compact))
    expect(normalizeSchemaSql(spaced)).not.toBe(normalizeSchemaSql(changed))
  })
})

describe('nuxt-cf-jobs schema contract', () => {
  const packageJsonPath = resolve(process.cwd(), 'node_modules/nuxt-cf-jobs/package.json')
  const schemaSourcePath = resolve(process.cwd(), 'node_modules/nuxt-cf-jobs/dist/runtime/server/d1.js')

  it('pins the installed package and distributed schema to the expected indexes', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string }
    const distributedSchemaSource = readFileSync(schemaSourcePath, 'utf8')

    expect(verifyCfJobsPackageContract({
      installedVersion: packageJson.version,
      distributedSchemaSource,
    })).toEqual({ _tag: 'pass' })
  })

  it('fails a package version bump until the pinned contract is updated', () => {
    const distributedSchemaSource = readFileSync(schemaSourcePath, 'utf8')

    expect(verifyCfJobsPackageContract({
      installedVersion: '0.15.0',
      distributedSchemaSource,
    })).toMatchObject({
      _tag: 'fail',
      issues: [{ _tag: 'package_version_mismatch', expected: '0.14.0', actual: '0.15.0' }],
    })
  })
})

function snapshotFromContract(
  contract: SchemaContract,
  overrides: Partial<SchemaSnapshot> = {},
): SchemaSnapshot {
  return {
    migrationLedger: [...contract.migrationNames],
    objects: contract.objects.map(object => ({ ...object })),
    foreignKeys: contract.foreignKeys.map(foreignKey => ({ ...foreignKey })),
    foreignKeyViolations: [],
    ...overrides,
  }
}
