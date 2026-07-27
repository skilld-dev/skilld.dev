import type { ExecFileResult, ParityExecFile } from '../../scripts/check-embedding-parity'
import { describe, expect, it, vi } from 'vitest'
import { vectorIdFor } from '../../layers/registry/server/utils/vector-id'
import {
  runRemoteEmbeddingParityCli,
} from '../../scripts/check-embedding-parity'

describe('embedding parity CLI', () => {
  it.each([
    [[]],
    [['--remote']],
    [['--dry-run']],
  ])('refuses invocation without explicit remote dry-run: %j', async (args) => {
    const execFile = vi.fn<ParityExecFile>()

    const result = await runRemoteEmbeddingParityCli(args, { execFile })

    expect(result).toEqual({ _tag: 'refused', reason: 'remote_dry_run_required' })
    expect(execFile).not.toHaveBeenCalled()
  })

  it('uses only read-only argv, completes cursor pagination, and returns parity', async () => {
    const eligible = { owner: 'acme', repo: 'skills', name: 'one' }
    const expectedId = await vectorIdFor(eligible)
    const orphanId = 'orphan-id'
    const calls: string[][] = []
    const execFile = vi.fn<ParityExecFile>(async (_file, args) => {
      calls.push(args)
      if (args[0] === 'd1') {
        return json([{
          success: true,
          results: [{ ...eligible, current_sha: 'sha-current', marker_sha: 'sha-current' }],
        }])
      }
      if (args[1] === 'list-vectors' && !args.includes('--cursor')) {
        return json({
          vectors: [{ id: expectedId }],
          count: 1,
          totalCount: 2,
          isTruncated: true,
          nextCursor: 'next-page',
        })
      }
      if (args[1] === 'list-vectors') {
        return json({
          vectors: [{ id: orphanId }],
          count: 1,
          totalCount: 2,
          isTruncated: false,
        })
      }
      return {
        stdout: `📋 Fetching vectors...\n${JSON.stringify([{
          id: expectedId,
          values: [],
          metadata: { sha: 'sha-current' },
        }])}`,
        stderr: '',
      }
    })

    const result = await runRemoteEmbeddingParityCli(['--remote', '--dry-run'], { execFile })

    expect(result).toMatchObject({
      _tag: 'completed',
      alarm: {
        _tag: 'triggered',
        missing: 0,
        stale: 0,
        orphan: 1,
      },
      parity: {
        counts: { eligible: 1, present: 1, missing: 0, stale: 0, orphan: 1 },
        ids: { orphan: [orphanId] },
      },
    })
    expect(calls.filter(args => args[1] === 'list-vectors')).toHaveLength(2)
    expect(calls).toContainEqual([
      'vectorize',
      'list-vectors',
      'skill-embeddings',
      '--count',
      '1000',
      '--json',
      '--cursor',
      'next-page',
    ])
    expect(calls).toContainEqual([
      'vectorize',
      'get-vectors',
      'skill-embeddings',
      '--ids',
      expectedId,
    ])
    for (const args of calls) {
      expect(args).not.toContain('insert')
      expect(args).not.toContain('upsert')
      expect(args).not.toContain('delete')
      expect(args).not.toContain('migrations')
    }
    const d1 = calls.find(args => args[0] === 'd1')!
    expect(d1.slice(0, 4)).toEqual(['d1', 'execute', 'DB', '--remote'])
    expect(d1).toContain('--command')
    expect(d1).toContain('--json')
    expect(d1[d1.indexOf('--command') + 1]).toMatch(/^\s*SELECT/)
  })

  it('queues missing vectors for repair only with explicit remote apply', async () => {
    const eligible = { owner: 'acme', repo: 'skills', name: 'missing' }
    const expectedId = await vectorIdFor(eligible)
    const calls: string[][] = []
    const execFile = vi.fn<ParityExecFile>(async (_file, args) => {
      calls.push(args)
      const sql = args[args.indexOf('--command') + 1] ?? ''
      if (args[0] === 'd1' && /^\s*SELECT/.test(sql)) {
        return json([{
          success: true,
          results: [{ ...eligible, current_sha: 'sha-current', marker_sha: 'sha-current' }],
        }])
      }
      if (args[1] === 'list-vectors') {
        return json({
          vectors: [],
          count: 0,
          totalCount: 0,
          isTruncated: false,
        })
      }
      if (args[1] === 'get-vectors') {
        return {
          stdout: 'The index does not contain vectors corresponding to the provided ids.',
          stderr: '',
        }
      }
      return json([{ success: true, results: [], meta: { changes: 1 } }])
    })

    const result = await runRemoteEmbeddingParityCli(
      ['--remote', '--repair', '--apply'],
      { execFile },
    )

    expect(result).toMatchObject({
      _tag: 'repair_queued',
      candidates: 1,
      markersInvalidated: 1,
      parity: {
        counts: { eligible: 1, missing: 1, stale: 0 },
        ids: { missing: [expectedId] },
      },
    })
    const writes = calls.filter((args) => {
      const sql = args[args.indexOf('--command') + 1] ?? ''
      return args[0] === 'd1' && sql.includes('DELETE')
    })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('--remote')
    expect(writes[0]![writes[0]!.indexOf('--command') + 1]).toContain(
      `marker.sha = candidates.content_sha`,
    )
  })

  it('queues only orphan vectors for explicit remote pruning', async () => {
    const orphanIds = ['--config', 'orphan-two']
    const calls: string[][] = []
    const execFile = vi.fn<ParityExecFile>(async (_file, args) => {
      calls.push(args)
      if (args[0] === 'd1')
        return json([{ success: true, results: [] }])
      if (args[1] === 'list-vectors') {
        return json({
          vectors: orphanIds.map(id => ({ id })),
          count: orphanIds.length,
          totalCount: orphanIds.length,
          isTruncated: false,
        })
      }
      return { stdout: 'Successfully enqueued 2 vectors for deletion.', stderr: '' }
    })

    const result = await runRemoteEmbeddingParityCli(
      ['--remote', '--prune-orphans', '--apply'],
      { execFile },
    )

    expect(result).toMatchObject({
      _tag: 'orphan_cleanup_queued',
      candidates: 2,
      deletionsQueued: 2,
      parity: {
        counts: { eligible: 0, missing: 0, stale: 0, orphan: 2 },
        ids: { orphan: orphanIds },
      },
    })
    expect(calls).toContainEqual([
      'vectorize',
      'delete-vectors',
      'skill-embeddings',
      '--ids=--config',
      '--ids=orphan-two',
    ])
    expect(calls.some((args) => {
      const sql = args[args.indexOf('--command') + 1] ?? ''
      return args[0] === 'd1' && sql.includes('DELETE')
    })).toBe(false)
  })

  it('keeps a vector that becomes eligible before orphan deletion', async () => {
    const skill = {
      owner: 'acme',
      repo: 'skills',
      name: 'newly-eligible',
      current_sha: 'sha-current',
      marker_sha: 'sha-current',
    }
    const vectorId = await vectorIdFor(skill)
    let d1Reads = 0
    const calls: string[][] = []
    const execFile = vi.fn<ParityExecFile>(async (_file, args) => {
      calls.push(args)
      if (args[0] === 'd1') {
        d1Reads++
        return json([{
          success: true,
          results: d1Reads === 1 ? [] : [skill],
        }])
      }
      if (args[1] === 'list-vectors') {
        return json({
          vectors: [{ id: vectorId }],
          count: 1,
          totalCount: 1,
          isTruncated: false,
        })
      }
      throw new Error('delete must not run for a newly eligible vector')
    })

    const result = await runRemoteEmbeddingParityCli(
      ['--remote', '--prune-orphans', '--apply'],
      { execFile },
    )

    expect(result).toMatchObject({
      _tag: 'orphan_cleanup_queued',
      candidates: 1,
      deletionsQueued: 0,
      retainedAfterRecheck: 1,
    })
    expect(d1Reads).toBe(2)
    expect(calls.some(args => args[1] === 'delete-vectors')).toBe(false)
  })

  it('chunks orphan deletion and encodes every provider ID as an option value', async () => {
    const orphanIds = Array.from({ length: 101 }, (_, index) => index === 0 ? '--config' : `orphan-${index}`)
    const calls: string[][] = []
    const execFile = vi.fn<ParityExecFile>(async (_file, args) => {
      calls.push(args)
      if (args[0] === 'd1')
        return json([{ success: true, results: [] }])
      if (args[1] === 'list-vectors') {
        return json({
          vectors: orphanIds.map(id => ({ id })),
          count: orphanIds.length,
          totalCount: orphanIds.length,
          isTruncated: false,
        })
      }
      return { stdout: 'Deletion queued.', stderr: '' }
    })

    await runRemoteEmbeddingParityCli(
      ['--remote', '--prune-orphans', '--apply'],
      { execFile },
    )

    const deletes = calls.filter(args => args[1] === 'delete-vectors')
    expect(deletes).toHaveLength(2)
    expect(deletes.every(args =>
      args.slice(3).length <= 100
      && args.slice(3).every(value => value.startsWith('--ids=')),
    )).toBe(true)
    expect(deletes[0]).toContain('--ids=--config')
    expect(deletes.flat()).not.toContain('--config')
  })

  it.each([
    [['--remote', '--repair']],
    [['--remote', '--apply']],
    [['--remote', '--repair', '--dry-run']],
    [['--remote', '--prune-orphans']],
    [['--remote', '--prune-orphans', '--dry-run']],
  ])('refuses incomplete repair authority: %j', async (args) => {
    const execFile = vi.fn<ParityExecFile>()

    const result = await runRemoteEmbeddingParityCli(args, { execFile })

    expect(result).toEqual({ _tag: 'refused', reason: 'remote_apply_required' })
    expect(execFile).not.toHaveBeenCalled()
  })

  it('fails closed on malformed Wrangler output', async () => {
    const execFile = vi.fn<ParityExecFile>(async () => ({ stdout: '{not-json', stderr: '' }))

    await expect(runRemoteEmbeddingParityCli(
      ['--remote', '--dry-run'],
      { execFile },
    )).rejects.toThrow('Malformed D1 JSON')
  })

  it('keeps Vectorize get-vectors requests within the provider limit', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      owner: 'acme',
      repo: 'skills',
      name: `skill-${index}`,
      current_sha: `sha-${index}`,
      marker_sha: `sha-${index}`,
    }))
    const ids = await Promise.all(rows.map(row => vectorIdFor(row)))
    const calls: string[][] = []
    const execFile = vi.fn<ParityExecFile>(async (_file, args) => {
      calls.push(args)
      if (args[0] === 'd1')
        return json([{ success: true, results: rows }])
      if (args[1] === 'list-vectors') {
        return json({
          vectors: ids.map(id => ({ id })),
          count: ids.length,
          totalCount: ids.length,
          isTruncated: false,
        })
      }
      const requested = args.slice(args.indexOf('--ids') + 1)
      return {
        stdout: JSON.stringify(requested.map((id) => {
          const index = ids.indexOf(id)
          return { id, metadata: { sha: `sha-${index}` } }
        })),
        stderr: '',
      }
    })

    const result = await runRemoteEmbeddingParityCli(
      ['--remote', '--dry-run'],
      { execFile },
    )

    expect(result).toMatchObject({
      _tag: 'completed',
      parity: { counts: { present: 21, missing: 0, stale: 0 } },
    })
    const getCalls = calls.filter(args => args[1] === 'get-vectors')
    expect(getCalls).toHaveLength(2)
    expect(getCalls.every(args => args.slice(args.indexOf('--ids') + 1).length <= 20)).toBe(true)
  })
})

function json(value: unknown): ExecFileResult {
  return { stdout: JSON.stringify(value), stderr: '' }
}
