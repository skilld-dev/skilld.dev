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

  it('allows one quoted table name in foreign key inspection', () => {
    expect(assertReadOnlyInspectionQuery(`PRAGMA foreign_key_list("skills")`))
      .toEqual({ _tag: 'allowed' })
    expect(assertReadOnlyInspectionQuery(`PRAGMA foreign_key_list("skills"); DELETE FROM skills`))
      .toMatchObject({ _tag: 'rejected' })
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
    const execFile = vi.fn<SchemaVerifyExecFile>(async (_file, args) => {
      const commandIndex = args.indexOf('--command')
      const command = args[commandIndex + 1]!
      expect(commandIndex).toBeGreaterThan(-1)
      expect(args).toContain('--remote')
      expect(args).toContain('--json')
      expect(assertReadOnlyInspectionQuery(command)).toEqual({ _tag: 'allowed' })
      let results: unknown[]
      if (command.includes('FROM d1_migrations')) {
        results = contract.migrationNames.map((name, index) => ({ id: index + 1, name }))
      }
      else if (command.includes('FROM sqlite_master')) {
        results = contract.objects.map(object => ({
          type: object.type,
          name: object.name,
          table_name: object.tableName,
          sql: object.sql,
        }))
      }
      else if (command.startsWith('PRAGMA foreign_key_list')) {
        const tableName = command.match(/^PRAGMA foreign_key_list\("([^"]+)"\)$/)?.[1]
        results = contract.foreignKeys
          .filter(foreignKey => foreignKey.tableName === tableName)
          .map(foreignKey => ({
            table: foreignKey.referencedTable,
            from: foreignKey.from,
            to: foreignKey.to,
            on_update: foreignKey.onUpdate,
            on_delete: foreignKey.onDelete,
            match: foreignKey.match,
          }))
      }
      else {
        results = []
      }
      return {
        stdout: JSON.stringify([{
          success: true,
          results,
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
    const tableCount = contract.objects.filter(object => object.type === 'table').length
    expect(execFile).toHaveBeenCalledTimes(tableCount + 3)
  })
})
