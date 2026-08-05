import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PRUNE_PER_RUN,
  MAX_PRUNE_SHARE,
  planEmbeddingPrune,
  pruneOrphanEmbeddings,
} from '../../layers/registry/server/utils/embedding-parity'
import { vectorIdFor } from '../../layers/registry/server/utils/vector-id'

function candidates(count: number, prefix = 'skill') {
  return Array.from({ length: count }, (_, index) => ({
    owner: 'acme',
    repo: 'skills',
    name: `${prefix}-${index}`,
  }))
}

describe('planEmbeddingPrune guard rail', () => {
  it('does nothing when no skill left eligibility', () => {
    expect(planEmbeddingPrune([], 2_800)).toEqual({ _tag: 'nothing_to_prune' })
  })

  it('prunes an ordinary trickle', () => {
    const plan = planEmbeddingPrune(candidates(106), 2_800)
    expect(plan._tag).toBe('prune')
    if (plan._tag !== 'prune')
      return
    expect(plan.candidates).toHaveLength(106)
    expect(plan.deferred).toBe(0)
  })

  it('drains the accumulated production backlog instead of refusing it', () => {
    // Measured read-only against production on 2026-08-05.
    const plan = planEmbeddingPrune(candidates(826), 5_424)
    expect(plan._tag).toBe('prune')
    if (plan._tag !== 'prune')
      return
    expect(plan.candidates).toHaveLength(MAX_PRUNE_PER_RUN)
    expect(plan.deferred).toBe(326)
  })

  it('refuses when the candidate set rivals the eligible set', () => {
    // The shape a broken eligibility read takes: most of the index looks strandable.
    const plan = planEmbeddingPrune(candidates(2_800), 2_800)
    expect(plan._tag).toBe('refused')
    if (plan._tag !== 'refused')
      return
    expect(plan.reason).toBe('candidate_share_exceeded')
    expect(plan.candidates).toBe(2_800)
  })

  it('refuses when nothing is eligible at all', () => {
    expect(planEmbeddingPrune(candidates(5), 0)._tag).toBe('refused')
  })

  it('holds the line exactly at the share threshold', () => {
    const eligible = 1_000
    const atLimit = planEmbeddingPrune(candidates(eligible * MAX_PRUNE_SHARE), eligible)
    const overLimit = planEmbeddingPrune(candidates(eligible * MAX_PRUNE_SHARE + 1), eligible)
    expect(atLimit._tag).toBe('prune')
    expect(overLimit._tag).toBe('refused')
  })

  it('defers past the per-run cap instead of deleting more', () => {
    const plan = planEmbeddingPrune(candidates(MAX_PRUNE_PER_RUN + 25), 100_000)
    expect(plan._tag).toBe('prune')
    if (plan._tag !== 'prune')
      return
    expect(plan.candidates).toHaveLength(MAX_PRUNE_PER_RUN)
    expect(plan.deferred).toBe(25)
  })
})

function stubDeps(rows: ReturnType<typeof candidates>, eligible: number) {
  const deleteByIds = vi.fn(async () => ({ mutationId: 'stub' }))
  const statements: Array<{ sql: string, params: unknown[] }> = []
  const batch = vi.fn(async () => [])
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        const statement = { sql, params }
        return {
          ...statement,
          all: async () => ({ results: rows }),
          first: async () => ({ eligible }),
        }
      },
      first: async () => ({ eligible }),
    }),
    batch: async (items: Array<{ sql: string, params: unknown[] }>) => {
      statements.push(...items)
      return batch()
    },
  }
  return { db: db as never, vectorize: { deleteByIds } as never, deleteByIds, statements }
}

describe('pruneOrphanEmbeddings', () => {
  it('deletes exactly the ids derived from the candidate identities', async () => {
    const rows = candidates(3)
    const deps = stubDeps(rows, 2_800)
    const outcome = await pruneOrphanEmbeddings(deps)

    expect(outcome.plan).toBe('prune')
    expect(outcome.deleted).toBe(3)
    expect(deps.deleteByIds).toHaveBeenCalledOnce()
    expect(deps.deleteByIds.mock.calls[0]![0])
      .toEqual(await Promise.all(rows.map(row => vectorIdFor(row))))
  })

  it('clears the embedding marker for every deleted vector', async () => {
    const deps = stubDeps(candidates(3), 2_800)
    await pruneOrphanEmbeddings(deps)

    expect(deps.statements).toHaveLength(3)
    for (const statement of deps.statements) {
      expect(statement.sql).toContain('DELETE FROM skill_generated')
      expect(statement.sql).toContain(`kind = 'embedding'`)
    }
  })

  it('deletes nothing when the guard rail refuses', async () => {
    const deps = stubDeps(candidates(2_800), 2_800)
    const outcome = await pruneOrphanEmbeddings(deps)

    expect(outcome.plan).toBe('refused')
    expect(outcome.deleted).toBe(0)
    expect(deps.deleteByIds).not.toHaveBeenCalled()
    expect(deps.statements).toHaveLength(0)
  })

  it('leaves the index alone when nothing is strandable', async () => {
    const deps = stubDeps([], 2_800)
    const outcome = await pruneOrphanEmbeddings(deps)

    expect(outcome.plan).toBe('nothing_to_prune')
    expect(deps.deleteByIds).not.toHaveBeenCalled()
  })
})
