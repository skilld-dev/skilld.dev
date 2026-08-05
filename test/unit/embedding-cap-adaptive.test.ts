import { describe, expect, it } from 'vitest'
import {
  EMBEDDING_BURST_LIMIT,
  EMBEDDING_STEADY_LIMIT,
  runtimeGenerationLimits,
} from '../../layers/registry/server/utils/ai-generation-work'

function querySpend(limits: ReturnType<typeof runtimeGenerationLimits>): number {
  return limits.embedding * limits.embeddingQueriesPerItem
    + limits.abstractness * limits.abstractnessQueriesPerItem
}

describe('runtimeGenerationLimits', () => {
  it('holds the steady limit when no backlog is measured', () => {
    expect(runtimeGenerationLimits().embedding).toBe(EMBEDDING_STEADY_LIMIT)
  })

  it('holds the steady limit when the backlog is within it', () => {
    expect(runtimeGenerationLimits({ embedding: 0 }).embedding).toBe(EMBEDDING_STEADY_LIMIT)
    expect(runtimeGenerationLimits({ embedding: 12 }).embedding).toBe(EMBEDDING_STEADY_LIMIT)
  })

  it('rises with the backlog once the steady rate cannot clear it', () => {
    expect(runtimeGenerationLimits({ embedding: 60 }).embedding).toBe(60)
  })

  it('clears the largest recorded ingest day faster than it arrives', () => {
    // 879 skills arrived on 2026-08-04 against a 480-a-day ceiling.
    const perRun = runtimeGenerationLimits({ embedding: 879 }).embedding
    expect(perRun * 24).toBeGreaterThan(879)
  })

  it('caps the burst so one run cannot flood the index', () => {
    expect(runtimeGenerationLimits({ embedding: 100_000 }).embedding).toBe(EMBEDDING_BURST_LIMIT)
  })

  it('never spends more than the invocation query budget', () => {
    for (const backlog of [0, 1, 20, 100, 5_000, 100_000]) {
      const limits = runtimeGenerationLimits({ embedding: backlog })
      expect(querySpend(limits)).toBeLessThanOrEqual(
        limits.invocationQueryLimit - limits.reservedQueries,
      )
    }
  })

  it('reserves abstractness capacity even at the burst ceiling', () => {
    expect(runtimeGenerationLimits({ embedding: 100_000 }).abstractness)
      .toBeGreaterThanOrEqual(20)
  })

  it('ignores a negative or fractional backlog', () => {
    expect(runtimeGenerationLimits({ embedding: -5 }).embedding).toBe(EMBEDDING_STEADY_LIMIT)
    expect(runtimeGenerationLimits({ embedding: 60.9 }).embedding).toBe(60)
  })
})
