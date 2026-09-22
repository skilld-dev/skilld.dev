import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyMigrationNaming } from '../../scripts/lib/d1-schema-verifier'

describe('migration naming', () => {
  it('accepts this repository\'s own migrations directory', () => {
    const names = readdirSync(resolve(process.cwd(), 'migrations')).filter(file => file.endsWith('.sql'))

    expect(verifyMigrationNaming(names)).toEqual({ _tag: 'ok' })
  })

  it('rejects two migrations that claim the same number', () => {
    const result = verifyMigrationNaming([
      '0001_first.sql',
      '0002_second.sql',
      '0002_also_second.sql',
    ])

    expect(result).toEqual({
      _tag: 'fail',
      issues: [{
        _tag: 'duplicate_number',
        number: '0002',
        names: ['0002_also_second.sql', '0002_second.sql'],
      }],
    })
  })

  it('lets through the exact pair already applied in production', () => {
    const result = verifyMigrationNaming([
      '0117_email_cadence_split.sql',
      '0118_auto_index_rate_limits.sql',
      '0118_repo_tree_truncated.sql',
      '0119_drop_click_and_install_events.sql',
    ])

    expect(result).toEqual({ _tag: 'ok' })
  })

  it('still rejects a third file joining an exempt number', () => {
    const result = verifyMigrationNaming([
      '0117_email_cadence_split.sql',
      '0118_auto_index_rate_limits.sql',
      '0118_repo_tree_truncated.sql',
      '0118_one_too_many.sql',
      '0119_drop_click_and_install_events.sql',
    ])

    expect(result).toMatchObject({
      _tag: 'fail',
      issues: [expect.objectContaining({ _tag: 'duplicate_number', number: '0118' })],
    })
  })

  it('rejects a hole in the sequence', () => {
    const result = verifyMigrationNaming([
      '0001_first.sql',
      '0004_fourth.sql',
    ])

    expect(result).toEqual({
      _tag: 'fail',
      issues: [{ _tag: 'sequence_gap', missing: ['0002', '0003'] }],
    })
  })

  it('rejects a name that does not match the pattern', () => {
    const result = verifyMigrationNaming([
      '0001_first.sql',
      '2_second.sql',
      '0003-Third.SQL',
    ])

    expect(result).toMatchObject({
      _tag: 'fail',
      issues: [
        { _tag: 'malformed_name', name: '0003-Third.SQL' },
        { _tag: 'malformed_name', name: '2_second.sql' },
      ],
    })
  })

  it('reads an empty directory as nothing to check', () => {
    expect(verifyMigrationNaming([])).toEqual({ _tag: 'ok' })
  })
})
