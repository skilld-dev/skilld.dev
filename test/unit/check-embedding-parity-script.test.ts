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
          nextCursor: null,
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

  it('fails closed on malformed Wrangler output', async () => {
    const execFile = vi.fn<ParityExecFile>(async () => ({ stdout: '{not-json', stderr: '' }))

    await expect(runRemoteEmbeddingParityCli(
      ['--remote', '--dry-run'],
      { execFile },
    )).rejects.toThrow('Malformed D1 JSON')
  })
})

function json(value: unknown): ExecFileResult {
  return { stdout: JSON.stringify(value), stderr: '' }
}
