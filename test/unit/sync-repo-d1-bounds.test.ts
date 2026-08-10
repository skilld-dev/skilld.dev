import { describe, expect, it, vi } from 'vitest'
import {
  EXISTING_SKILL_ASSET_CHUNK,
  loadExistingSkillAssets,
  loadExistingSkillSummaries,
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
