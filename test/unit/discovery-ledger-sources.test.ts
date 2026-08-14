// @vitest-environment node
import type { LedgerSource } from '../../shared/server/discovery-ledger'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { pickAnnouncements, submitDiscoveredRepos } from '../../shared/server/discovery-ledger'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
  'migrations/0101_discovery_ledger_size_guard.sql',
  'migrations/0103_bluesky_discovery.sql',
]
const NOW = 1_760_000_000

let harness: SqliteD1 | null = null

function db() {
  harness ??= createSqliteD1(MIGRATIONS)
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

function seed(input: {
  source: LedgerSource
  repo: string
  score: number
  status?: string
  announced?: boolean
}) {
  db().raw.prepare(
    `INSERT INTO discovery_ledger (
       source, owner, repo, evidence_url, evidence_text, evidence_score,
       first_seen_at, last_seen_at, status, announced_at
     ) VALUES (?, 'owner', ?, 'https://example.com/p', 'text', ?, ?, ?, ?, ?)`,
  ).run(
    input.source,
    input.repo,
    input.score,
    NOW,
    NOW,
    input.status ?? 'pending',
    input.announced ? NOW : null,
  )
}

/**
 * The scales these tests encode, measured over the same 30-day window:
 * an X post that trends clears thousands of weighted points, while the highest
 * scoring Bluesky post reached 20. Any ranking that compares the two numbers
 * directly ranks the platform, not the evidence.
 */
describe('submitDiscoveredRepos across sources', () => {
  it('submits each source\'s best before any source\'s second', async () => {
    seed({ source: 'x', repo: 'x-top', score: 5000 })
    seed({ source: 'x', repo: 'x-second', score: 4000 })
    seed({ source: 'bsky', repo: 'bsky-top', score: 40 })

    const enqueued: string[] = []
    await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      limit: 2,
      measureRepoSize: async () => ({ _tag: 'ok', skillCount: 3 }),
      enqueue: async (_env, payload) => {
        enqueued.push(payload.repo)
        return { jobId: 'j', status: 'queued' }
      },
    })

    // Without per-source ranking this would be ['x-top', 'x-second'] and the
    // Bluesky repo would never be reached on any run.
    expect(enqueued.sort()).toEqual(['bsky-top', 'x-top'])
  })

  it('still submits strongest first within one source', async () => {
    seed({ source: 'bsky', repo: 'weak', score: 2 })
    seed({ source: 'bsky', repo: 'strong', score: 45 })

    const enqueued: string[] = []
    await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      limit: 1,
      measureRepoSize: async () => ({ _tag: 'ok', skillCount: 3 }),
      enqueue: async (_env, payload) => {
        enqueued.push(payload.repo)
        return { jobId: 'j', status: 'queued' }
      },
    })

    expect(enqueued).toEqual(['strong'])
  })
})

describe('pickAnnouncements across sources', () => {
  it('applies each source\'s own threshold', async () => {
    seed({ source: 'x', repo: 'x-loud', score: 900, status: 'indexed' })
    seed({ source: 'x', repo: 'x-quiet', score: 60, status: 'indexed' })
    seed({ source: 'bsky', repo: 'bsky-loud', score: 60, status: 'indexed' })
    seed({ source: 'bsky', repo: 'bsky-quiet', score: 10, status: 'indexed' })

    const picked = await pickAnnouncements({
      db: db().db,
      minEvidenceScoreBySource: { x: 300, bsky: 50 },
    })

    // A score of 60 announces on Bluesky and is silence on X. One shared
    // number cannot express that in either direction.
    expect(picked.map(p => p.repo).sort()).toEqual(['bsky-loud', 'x-loud'])
  })

  it('never announces a source with no threshold configured', async () => {
    seed({ source: 'hn', repo: 'hn-repo', score: 100_000, status: 'indexed' })

    const picked = await pickAnnouncements({
      db: db().db,
      minEvidenceScoreBySource: { x: 300 },
    })

    expect(picked).toEqual([])
  })

  it('does not let a high-scoring source fill the whole limit', async () => {
    seed({ source: 'x', repo: 'x-a', score: 9000, status: 'indexed' })
    seed({ source: 'x', repo: 'x-b', score: 8000, status: 'indexed' })
    seed({ source: 'bsky', repo: 'bsky-a', score: 55, status: 'indexed' })

    const picked = await pickAnnouncements({
      db: db().db,
      minEvidenceScoreBySource: { x: 300, bsky: 50 },
      limit: 2,
    })

    expect(picked.map(p => p.repo).sort()).toEqual(['bsky-a', 'x-a'])
  })

  it('skips anything already announced', async () => {
    seed({ source: 'bsky', repo: 'done', score: 90, status: 'indexed', announced: true })

    const picked = await pickAnnouncements({
      db: db().db,
      minEvidenceScoreBySource: { bsky: 50 },
    })

    expect(picked).toEqual([])
  })

  it('carries the source through so the message can name the right network', async () => {
    seed({ source: 'bsky', repo: 'r', score: 90, status: 'indexed' })

    const picked = await pickAnnouncements({
      db: db().db,
      minEvidenceScoreBySource: { bsky: 50 },
    })

    expect(picked[0]?.source).toBe('bsky')
  })
})
