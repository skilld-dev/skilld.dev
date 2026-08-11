import { describe, expect, it, vi } from 'vitest'
import {
  D1_BATCH_CHAR_BUDGET,
  EXISTING_SKILL_ASSET_CHUNK,
  loadExistingSkillAssets,
  loadExistingSkillSummaries,
  planWriteBatches,
  runBoundedBatch,
  weighWrite,
} from '../../layers/registry/server/utils/sync-repo'

interface StatementResult {
  name: string
  assets: string
}

function stubDb(rows: StatementResult[]) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const prepare = vi.fn((sql: string) => ({
    bind: (...params: unknown[]) => ({
      all: async () => {
        calls.push({ sql, params })
        if (sql.includes('assets') && !sql.includes('name IN')) {
          throw new Error('Serialized RPC value was 48516427 bytes')
        }
        const requested = new Set(params.slice(2).map(String))
        return {
          results: rows.filter(row => requested.size === 0 || requested.has(row.name)),
        }
      },
    }),
  }))
  return {
    db: { prepare } as unknown as D1Database,
    calls,
  }
}

describe('sync repository D1 result bounds', () => {
  it('keeps assets out of the repository-wide skill summary read', async () => {
    const { db, calls } = stubDb([{ name: 'one', assets: '[]' }])

    const summaries = await loadExistingSkillSummaries(db, 'acme', 'skills')

    expect(summaries.get('one')?.name).toBe('one')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).not.toMatch(/\bassets\b/)
  })

  it('reads large asset columns in platform-bounded chunks', async () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      name: `skill-${index}`,
      assets: '[]',
    }))
    const { db, calls } = stubDb(rows)

    const assets = await loadExistingSkillAssets(db, 'acme', 'skills', rows.map(row => row.name))

    expect(assets).toHaveLength(rows.length)
    expect(calls).toHaveLength(Math.ceil(rows.length / EXISTING_SKILL_ASSET_CHUNK))
    expect(calls.every(call => call.params.length <= EXISTING_SKILL_ASSET_CHUNK + 2)).toBe(true)
  })
})

/** Stub that rejects any batch whose bound payload exceeds the platform ceiling. */
function stubBatchDb(ceiling: number) {
  const batches: number[][] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({ sql, params }),
    }),
    batch: async (statements: { params: unknown[] }[]) => {
      const bytes = statements.reduce(
        (total, statement) => total + statement.params.reduce<number>(
          (sum, param) => sum + (typeof param === 'string' ? param.length : 8),
          0,
        ),
        0,
      )
      if (bytes > ceiling) {
        throw new Error(
          `D1_ERROR: Serialized RPC arguments or return values are limited to 32MiB, but the size of this value was: ${bytes} bytes.`,
        )
      }
      batches.push(statements.map(statement => statement.params.length))
      // Each result carries the id its own statement was bound with, so a
      // mis-ordered merge is visible rather than plausible.
      return statements.map(statement => ({ meta: { changes: statement.params[0] as number } }))
    },
  } as unknown as D1Database
  return { db, batches }
}

describe('sync repository D1 write bounds', () => {
  it('splits a slice whose content exceeds the budget', () => {
    // Three skills at 60% of budget each cannot share a single batch.
    const weight = Math.floor(D1_BATCH_CHAR_BUDGET * 0.6)

    const groups = planWriteBatches([weight, weight, weight])

    expect(groups).toEqual([[0], [1], [2]])
  })

  it('keeps small writes together rather than one batch per statement', () => {
    const groups = planWriteBatches([10, 10, 10, 10])

    expect(groups).toEqual([[0, 1, 2, 3]])
  })

  it('gives an oversized single write its own batch instead of stranding the repository', () => {
    const groups = planWriteBatches([10, D1_BATCH_CHAR_BUDGET * 3, 10])

    expect(groups).toEqual([[0], [1], [2]])
  })

  it('survives the archived garrytan/gstack slice that failed at 48,516,427 bytes', async () => {
    // 50 skills averaging 192 KB of rendered HTML plus 57 KB of raw markdown,
    // which is the shape that overflowed on every hourly tick.
    const ceiling = 33_554_432
    const { db, batches } = stubBatchDb(ceiling)
    const writes = Array.from({ length: 50 }, (_, index) => weighWrite(
      db,
      'INSERT INTO skills (id, rendered_raw, rendered_html) VALUES (?, ?, ?)',
      [index, 'r'.repeat(57_000), 'h'.repeat(192_000)],
    ))

    const results = await runBoundedBatch(db, writes)

    expect(results).toHaveLength(50)
    expect(batches.length).toBeGreaterThan(1)
  })

  it('returns results in input order across a split so change counts stay attributable', async () => {
    const { db, batches } = stubBatchDb(33_554_432)
    const heavy = Math.floor(D1_BATCH_CHAR_BUDGET * 0.7)
    const writes = Array.from({ length: 4 }, (_, index) => weighWrite(
      db,
      'INSERT INTO skills (id, rendered_html) VALUES (?, ?)',
      [index, 'h'.repeat(heavy)],
    ))

    const results = await runBoundedBatch(db, writes)

    // Four writes at 70% of budget split into four batches. Callers index this
    // array by the position they pushed at, so the merge must undo the split.
    expect(batches).toHaveLength(4)
    expect(results.map(result => result.meta.changes)).toEqual([0, 1, 2, 3])
  })
})
