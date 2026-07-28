import type { EligibleEmbeddingRow } from '../../layers/registry/server/utils/embedding-parity'
import { describe, expect, it } from 'vitest'
import {
  auditEmbeddingParityViaBindings,
  embeddingParityAuditAlarm,
} from '../../layers/registry/server/utils/embedding-parity'
import { vectorIdFor } from '../../layers/registry/server/utils/vector-id'

describe('embedding parity audit over bindings', () => {
  it('proves zero orphans when the index holds exactly the eligible vectors', async () => {
    const rows = [eligible('one', 'sha-one'), eligible('two', 'sha-two')]
    const audit = await auditEmbeddingParityViaBindings(deps(rows, { vectorCount: 2 }))

    expect(audit.counts).toEqual({ eligible: 2, present: 2, missing: 0, stale: 0 })
    expect(audit.index).toEqual({ _tag: 'settled', vectorCount: 2, orphan: 0 })
    expect(embeddingParityAuditAlarm(audit)).toEqual({ _tag: 'clear' })
  })

  it('counts the surplus as orphans without enumerating the index', async () => {
    const rows = [eligible('one', 'sha-one')]
    const audit = await auditEmbeddingParityViaBindings(deps(rows, { vectorCount: 4 }))

    expect(audit.index).toEqual({ _tag: 'settled', vectorCount: 4, orphan: 3 })
    expect(embeddingParityAuditAlarm(audit)).toEqual({
      _tag: 'triggered',
      missing: 0,
      stale: 0,
      orphan: 3,
    })
  })

  it('reports a vector the index does not hold as missing', async () => {
    const rows = [eligible('one', 'sha-one'), eligible('gone', 'sha-gone')]
    const goneId = await vectorIdFor({ owner: 'acme', repo: 'skills', name: 'gone' })
    const audit = await auditEmbeddingParityViaBindings(
      deps(rows, { vectorCount: 1, absent: [goneId] }),
    )

    expect(audit.counts).toMatchObject({ eligible: 2, present: 1, missing: 1 })
    expect(audit.ids.missing).toEqual([goneId])
    expect(embeddingParityAuditAlarm(audit)).toMatchObject({ _tag: 'triggered', missing: 1 })
  })

  it('reports a vector whose metadata sha trails D1 as stale', async () => {
    const rows = [eligible('one', 'sha-new')]
    const audit = await auditEmbeddingParityViaBindings(
      deps(rows, { vectorCount: 1, shaOverride: 'sha-old' }),
    )

    expect(audit.counts).toMatchObject({ present: 0, stale: 1 })
    expect(embeddingParityAuditAlarm(audit)).toMatchObject({ _tag: 'triggered', stale: 1 })
  })

  it('does not alarm when a mutation lands while the audit is reading', async () => {
    const rows = [eligible('one', 'sha-one')]
    const audit = await auditEmbeddingParityViaBindings(
      deps(rows, { vectorCount: 1, mutationDrifts: true }),
    )

    expect(audit.index).toEqual({
      _tag: 'unsettled',
      reason: 'mutation_in_flight',
      vectorCount: 1,
    })
    expect(embeddingParityAuditAlarm(audit)).toEqual({
      _tag: 'unsettled',
      reason: 'mutation_in_flight',
    })
  })

  it('does not report negative orphans when the index count trails the reads', async () => {
    const rows = [eligible('one', 'sha-one'), eligible('two', 'sha-two')]
    const audit = await auditEmbeddingParityViaBindings(deps(rows, { vectorCount: 1 }))

    expect(audit.index).toEqual({
      _tag: 'unsettled',
      reason: 'count_below_expected',
      vectorCount: 1,
    })
    expect(embeddingParityAuditAlarm(audit)).toEqual({
      _tag: 'unsettled',
      reason: 'count_below_expected',
    })
  })

  it('reads the index size from either Vectorize describe shape', async () => {
    const rows = [eligible('one', 'sha-one')]
    const legacy = await auditEmbeddingParityViaBindings({
      ...deps(rows, { vectorCount: 1 }),
      vectorize: {
        ...deps(rows, { vectorCount: 1 }).vectorize,
        // The older generation names the field vectorsCount and reports no
        // processed-mutation marker at all.
        describe: async () => ({ vectorsCount: 3 }),
      },
    })

    expect(legacy.index).toEqual({ _tag: 'settled', vectorCount: 3, orphan: 2 })
  })

  it('refuses a describe response carrying no usable count', async () => {
    const rows = [eligible('one', 'sha-one')]
    await expect(auditEmbeddingParityViaBindings({
      ...deps(rows, { vectorCount: 1 }),
      vectorize: {
        ...deps(rows, { vectorCount: 1 }).vectorize,
        describe: async () => ({}),
      },
    })).rejects.toThrow('no usable vector count')
  })

  it('treats a size change across the read pass as unsettled', async () => {
    const rows = [eligible('one', 'sha-one')]
    let call = 0
    const audit = await auditEmbeddingParityViaBindings({
      ...deps(rows, { vectorCount: 1 }),
      vectorize: {
        ...deps(rows, { vectorCount: 1 }).vectorize,
        // Same mutation marker, different size: only the count reveals the move.
        describe: async () => ({ vectorCount: call++ === 0 ? 1 : 2, processedUpToMutation: 'm1' }),
      },
    })

    expect(audit.index).toEqual({
      _tag: 'unsettled',
      reason: 'mutation_in_flight',
      vectorCount: 2,
    })
  })

  it('keeps binding reads within the Vectorize getByIds limit', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => eligible(`skill-${index}`, `sha-${index}`))
    const chunkSizes: number[] = []
    const audit = await auditEmbeddingParityViaBindings(
      deps(rows, { vectorCount: 21, onChunk: size => chunkSizes.push(size) }),
    )

    expect(audit.counts.present).toBe(21)
    expect(chunkSizes).toEqual([20, 1])
  })
})

function eligible(name: string, sha: string): EligibleEmbeddingRow {
  return { owner: 'acme', repo: 'skills', name, currentSha: sha, markerSha: sha }
}

function deps(
  rows: EligibleEmbeddingRow[],
  options: {
    vectorCount: number
    absent?: string[]
    shaOverride?: string
    mutationDrifts?: boolean
    onChunk?: (size: number) => void
  },
) {
  const absent = new Set(options.absent ?? [])
  let mutation = 1
  return {
    db: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: rows.map(row => ({
              owner: row.owner,
              repo: row.repo,
              name: row.name,
              current_sha: row.currentSha,
              marker_sha: row.markerSha,
            })),
          }),
        }),
      }),
    } as unknown as D1Database,
    vectorize: {
      describe: async () => ({
        vectorCount: options.vectorCount,
        dimensions: 768,
        processedUpToDatetime: 0,
        processedUpToMutation: options.mutationDrifts ? mutation++ : 1,
      }),
      getByIds: async (requested: string[]) => {
        options.onChunk?.(requested.length)
        const wanted = await Promise.all(rows.map(async row => [await vectorIdFor(row), row] as const))
        const byId = new Map(wanted)
        return requested
          .filter(id => !absent.has(id))
          .map(id => ({
            id,
            values: [],
            metadata: { sha: options.shaOverride ?? byId.get(id)!.currentSha },
          }))
      },
    },
  }
}
