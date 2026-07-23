import type {
  SchemaVerifyExecFile,
} from '../../scripts/verify-d1-schema'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildExpectedSchemaContract,
} from '../../scripts/lib/d1-schema-verifier'
import {
  assertReadOnlyInspectionQuery,
  runD1SchemaVerifyCli,
} from '../../scripts/verify-d1-schema'

describe('d1 schema verification script', () => {
  it('refuses remote mode without the exact dry-run acknowledgement', async () => {
    const execFile = vi.fn<SchemaVerifyExecFile>()

    await expect(runD1SchemaVerifyCli(['--remote'], { execFile })).resolves.toEqual({
      _tag: 'refused',
      reason: 'remote_dry_run_required',
    })
    await expect(runD1SchemaVerifyCli(['--dry-run', '--remote'], { execFile })).resolves.toEqual({
      _tag: 'refused',
      reason: 'remote_dry_run_required',
    })
    expect(execFile).not.toHaveBeenCalled()
  })

  it.each([
    `UPDATE skills SET name = 'unsafe'`,
    `SELECT name FROM sqlite_master; DELETE FROM skills`,
    `PRAGMA optimize`,
    `SELECT * FROM skills`,
  ])('rejects non-read-only or out-of-contract SQL before execution: %s', (sql) => {
    expect(assertReadOnlyInspectionQuery(sql)).toMatchObject({
      _tag: 'rejected',
    })
  })

  it('rejects malformed Wrangler JSON', async () => {
    const execFile = vi.fn<SchemaVerifyExecFile>(async () => ({
      stdout: '{not-json',
      stderr: '',
    }))

    await expect(runD1SchemaVerifyCli(['--remote', '--dry-run'], {
      execFile,
    })).rejects.toThrow('Malformed Wrangler D1 JSON')
  })

  it('collects only approved reads and returns a tagged verification result', async () => {
    const contract = buildExpectedSchemaContract(resolve(process.cwd(), 'migrations'))
    const resultSets = [
      contract.migrationNames.map((name, index) => ({ id: index + 1, name })),
      contract.objects.map(object => ({
        type: object.type,
        name: object.name,
        table_name: object.tableName,
        sql: object.sql,
      })),
      contract.foreignKeys.map(foreignKey => ({
        table_name: foreignKey.tableName,
        referenced_table: foreignKey.referencedTable,
        from_column: foreignKey.from,
        to_column: foreignKey.to,
        on_update: foreignKey.onUpdate,
        on_delete: foreignKey.onDelete,
        match: foreignKey.match,
      })),
      [],
    ]
    const execFile = vi.fn<SchemaVerifyExecFile>(async (_file, args) => {
      const commandIndex = args.indexOf('--command')
      expect(commandIndex).toBeGreaterThan(-1)
      expect(args).toContain('--remote')
      expect(args).toContain('--json')
      expect(assertReadOnlyInspectionQuery(args[commandIndex + 1]!)).toEqual({ _tag: 'allowed' })
      return {
        stdout: JSON.stringify([{
          success: true,
          results: resultSets.shift(),
        }]),
        stderr: '',
      }
    })

    const result = await runD1SchemaVerifyCli(['--remote', '--dry-run'], {
      execFile,
    })

    expect(result).toMatchObject({
      _tag: 'completed',
      verification: { _tag: 'pass' },
    })
    expect(execFile).toHaveBeenCalledTimes(4)
  })
})
