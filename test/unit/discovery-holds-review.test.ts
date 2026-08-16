// @vitest-environment node
import type { LedgerSource } from '../../shared/server/discovery-ledger'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listLedger,
  releaseLedgerHold,
  reviewLedgerEntry,
  submitDiscoveredRepos,
} from '../../shared/server/discovery-ledger'
import { createSqliteD1 } from './helpers/d1-sqlite'

/**
 * The review surface for parked discoveries.
 *
 * `releaseLedgerHold` shipped with the size guard and nothing ever called it,
 * so the parked tail grew to 35 rows with no way to clear one. These tests
 * cover the three things the admin surface depends on: reading the held rows,
 * clearing a hold, and the released repo actually reaching the queue on the
 * next submit run instead of being parked again by the same guard.
 */

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
  'migrations/0101_discovery_ledger_size_guard.sql',
  'migrations/0103_bluesky_discovery.sql',
  'migrations/0106_discovery_ledger_attempts.sql',
]
const NOW = 1_760_000_000
const REVIEWER = 'harlan@harlanzw.com'

let harness: SqliteD1 | null = null

function db() {
  harness ??= createSqliteD1(MIGRATIONS)
  return harness
}

afterEach(() => {
  harness?.close()
  harness = null
})

interface SeedOptions {
  source?: LedgerSource
  owner?: string
  repo: string
  evidenceScore?: number
  skillCount?: number | null
  heldReason?: string | null
  status?: string
}

function seed(options: SeedOptions): number {
  db().raw.prepare(
    `INSERT INTO discovery_ledger (source, owner, repo, evidence_url, evidence_text,
       evidence_score, first_seen_at, last_seen_at, mention_count, status,
       skill_count, held_reason)
     VALUES (?, ?, ?, 'https://example.com/post/1', 'look at these skills', ?, ?, ?, 3, ?, ?, ?)`,
  ).run(
    options.source ?? 'x',
    options.owner ?? 'owner',
    options.repo,
    options.evidenceScore ?? 100,
    NOW,
    NOW,
    options.status ?? 'pending',
    options.skillCount ?? null,
    options.heldReason ?? null,
  )
  const row = db().raw.prepare(
    `SELECT id FROM discovery_ledger WHERE repo = ?`,
  ).get(options.repo) as { id: number }
  return row.id
}

function rowOf(repo: string) {
  return db().raw.prepare(
    `SELECT status, held_reason, reviewed_at, reviewed_by, review_note
     FROM discovery_ledger WHERE repo = ?`,
  ).get(repo) as {
    status: string
    held_reason: string | null
    reviewed_at: number | null
    reviewed_by: string | null
    review_note: string | null
  }
}

function recordingEnqueue() {
  const calls: string[] = []
  const enqueue = async (_env: never, p: { owner: string, repo: string }) => {
    calls.push(`${p.owner}/${p.repo}`)
    return { jobId: 'j', status: 'queued' as const }
  }
  return { calls, enqueue: enqueue as never }
}

describe('listLedger reads the parked tail', () => {
  it('returns only held rows when asked for them', async () => {
    seed({ repo: 'agent-skills', skillCount: 202, heldReason: 'oversized' })
    seed({ repo: 'claude-red', skillCount: null, heldReason: 'repo-gone' })
    seed({ repo: 'obsidian-skills', skillCount: 5 })

    const held = await listLedger({ db: db().db, status: 'pending', parked: 'held' })

    expect(held.map(entry => entry.repo).sort()).toEqual(['agent-skills', 'claude-red'])
  })

  it('carries the numbers the reviewer judges on', async () => {
    seed({ repo: 'agent-skills', skillCount: 202, heldReason: 'oversized', evidenceScore: 4200 })

    const [entry] = await listLedger({ db: db().db, status: 'pending', parked: 'held' })

    expect(entry).toMatchObject({
      owner: 'owner',
      repo: 'agent-skills',
      heldReason: 'oversized',
      skillCount: 202,
      evidenceScore: 4200,
      mentionCount: 3,
      evidenceUrl: 'https://example.com/post/1',
      evidenceText: 'look at these skills',
      firstSeenAt: NOW,
    })
  })

  it('excludes the parked tail from the submittable view', async () => {
    seed({ repo: 'agent-skills', skillCount: 202, heldReason: 'oversized' })
    seed({ repo: 'obsidian-skills', skillCount: 5 })

    const submittable = await listLedger({ db: db().db, status: 'pending', parked: 'submittable' })

    expect(submittable.map(entry => entry.repo)).toEqual(['obsidian-skills'])
  })

  /**
   * X scores run into the thousands and Bluesky's ceiling is about 50, so a
   * global score sort would bury every Bluesky row under every X row and a
   * reviewer working top-down would never reach one.
   */
  it('interleaves sources so a low-scoring network still reaches the top', async () => {
    seed({ source: 'x', repo: 'x-loud', evidenceScore: 4000, heldReason: 'oversized' })
    seed({ source: 'x', repo: 'x-quiet', evidenceScore: 900, heldReason: 'oversized' })
    seed({ source: 'bsky', repo: 'bsky-best', evidenceScore: 40, heldReason: 'oversized' })

    const held = await listLedger({ db: db().db, status: 'pending', parked: 'held' })

    expect(held.map(entry => entry.repo)).toEqual(['x-loud', 'bsky-best', 'x-quiet'])
  })
})

describe('releaseLedgerHold', () => {
  it('clears the hold and names the reviewer', async () => {
    const id = seed({ repo: 'agent-skills', skillCount: 202, heldReason: 'oversized' })

    const result = await releaseLedgerHold({
      db: db().db,
      id,
      reviewedBy: REVIEWER,
      note: 'Curated skills by the owner, worth indexing.',
      now: NOW,
    })

    expect(result).toEqual({ _tag: 'ok' })
    expect(rowOf('agent-skills')).toEqual({
      status: 'pending',
      held_reason: null,
      reviewed_at: NOW,
      reviewed_by: REVIEWER,
      review_note: 'Curated skills by the owner, worth indexing.',
    })
  })

  it('reports a row that was not held instead of reporting success', async () => {
    const id = seed({ repo: 'obsidian-skills', skillCount: 5 })

    const result = await releaseLedgerHold({
      db: db().db,
      id,
      reviewedBy: REVIEWER,
      note: 'Nothing to release.',
      now: NOW,
    })

    expect(result).toEqual({ _tag: 'no-matching-row' })
    expect(rowOf('obsidian-skills').reviewed_at).toBeNull()
  })

  it('reports an id that is not in the ledger', async () => {
    const result = await releaseLedgerHold({
      db: db().db,
      id: 9999,
      reviewedBy: REVIEWER,
      note: 'Nothing to release.',
      now: NOW,
    })

    expect(result).toEqual({ _tag: 'no-matching-row' })
  })

  it('submits the released repo on the next run, over the skill limit', async () => {
    const id = seed({ repo: 'agent-skills', skillCount: 202, heldReason: 'oversized' })
    await releaseLedgerHold({
      db: db().db,
      id,
      reviewedBy: REVIEWER,
      note: 'Curated skills by the owner, worth indexing.',
      now: NOW,
    })

    const { calls, enqueue } = recordingEnqueue()
    const summary = await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      skillLimit: 25,
      enqueue,
      measureRepoSize: async () => ({ _tag: 'sized', skillCount: 202 }),
    })

    expect(calls).toEqual(['owner/agent-skills'])
    expect(summary.queued).toBe(1)
    expect(summary.heldOversized).toBe(0)
    // Named separately, because a 202-skill repo entering the registry is the
    // largest single thing the pipeline does.
    expect(summary.admittedOversized).toBe(1)
    expect(rowOf('agent-skills').status).toBe('submitted')
  })

  it('still parks an oversized repo nobody reviewed', async () => {
    seed({ repo: 'aggregator-dump' })

    const { calls, enqueue } = recordingEnqueue()
    const summary = await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      skillLimit: 25,
      enqueue,
      measureRepoSize: async () => ({ _tag: 'sized', skillCount: 6341 }),
    })

    expect(calls).toEqual([])
    expect(summary.heldOversized).toBe(1)
    expect(summary.admittedOversized).toBe(0)
    expect(rowOf('aggregator-dump').held_reason).toBe('oversized')
  })

  it('parks a released repo again once GitHub stops serving it', async () => {
    const id = seed({ repo: 'claude-red', heldReason: 'repo-gone' })
    await releaseLedgerHold({
      db: db().db,
      id,
      reviewedBy: REVIEWER,
      note: 'Checking whether it came back.',
      now: NOW,
    })

    const { calls, enqueue } = recordingEnqueue()
    await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      enqueue,
      measureRepoSize: async () => ({ _tag: 'gone' }),
    })

    expect(calls).toEqual([])
    expect(rowOf('claude-red').held_reason).toBe('repo-gone')
  })
})

describe('reviewLedgerEntry rejects a discovery', () => {
  it('marks the row rejected and keeps it out of the submit queue', async () => {
    const id = seed({ repo: 'aggregator-dump', skillCount: 6341, heldReason: 'oversized' })

    const result = await reviewLedgerEntry({
      db: db().db,
      id,
      status: 'rejected',
      reviewedBy: REVIEWER,
      note: 'Aggregator dump of other people work.',
      now: NOW,
    })

    expect(result).toEqual({ _tag: 'ok' })
    expect(rowOf('aggregator-dump')).toMatchObject({
      status: 'rejected',
      reviewed_by: REVIEWER,
      review_note: 'Aggregator dump of other people work.',
    })

    const { calls, enqueue } = recordingEnqueue()
    await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      enqueue,
      measureRepoSize: async () => ({ _tag: 'sized', skillCount: 6341 }),
    })
    expect(calls).toEqual([])
  })

  it('drops a rejected row out of the held list', async () => {
    const id = seed({ repo: 'aggregator-dump', skillCount: 6341, heldReason: 'oversized' })
    await reviewLedgerEntry({
      db: db().db,
      id,
      status: 'rejected',
      reviewedBy: REVIEWER,
      note: 'Aggregator dump of other people work.',
      now: NOW,
    })

    const held = await listLedger({ db: db().db, status: 'pending', parked: 'held' })

    expect(held).toEqual([])
  })

  it('reports an id that is not in the ledger', async () => {
    const result = await reviewLedgerEntry({
      db: db().db,
      id: 9999,
      status: 'rejected',
      reviewedBy: REVIEWER,
      note: 'Nothing to reject.',
      now: NOW,
    })

    expect(result).toEqual({ _tag: 'no-matching-row' })
  })
})
