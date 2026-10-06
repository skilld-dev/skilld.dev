import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { submitDiscoveredRepos } from '../../shared/server/discovery-ledger'
import { createSqliteD1 } from './helpers/d1-sqlite'

/**
 * Why this file exists.
 *
 * `submitDiscoveredRepos` had two exits that changed nothing on the row: a
 * sizer that could not answer, and a throw from `enqueue`. Both leave the row
 * `pending`, which is correct, and both wrote no record of having tried, which
 * is not. Production sat with five root-skill repos at the head of the queue
 * for sixteen hours, re-attempted about sixty-four times, and the archive could
 * not say which of the two exits was firing or why.
 *
 * A row that was considered and not moved must now say so on itself.
 */

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0100_x_discovery_daily_budget.sql',
  'migrations/0101_discovery_ledger_size_guard.sql',
  'migrations/0103_bluesky_discovery.sql',
  'migrations/0106_discovery_ledger_attempts.sql',
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

function seed(repo: string) {
  db().raw.prepare(
    `INSERT INTO discovery_ledger (
       source, owner, repo, evidence_url, evidence_text, evidence_score,
       first_seen_at, last_seen_at, status
     ) VALUES ('x', 'owner', ?, 'https://example.com/p', 'text', 100, ?, ?, 'pending')`,
  ).run(repo, NOW, NOW)
}

function attemptOf(repo: string) {
  return db().raw.prepare(
    `SELECT status, last_attempt_at, last_attempt_outcome, last_attempt_detail
     FROM discovery_ledger WHERE repo = ?`,
  ).get(repo) as {
    status: string
    last_attempt_at: number | null
    last_attempt_outcome: string | null
    last_attempt_detail: string | null
  }
}

describe('submitDiscoveredRepos records every attempt', () => {
  it('records why an unmeasurable repo stayed pending', async () => {
    seed('unmeasurable')

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      measureRepoSize: async () => ({ _tag: 'unknown', reason: 'tree-403' }),
      enqueue: async () => ({ jobId: 'j', status: 'queued' }),
    })

    expect(summary.deferredUnmeasured).toBe(1)
    const row = attemptOf('unmeasurable')
    // Still pending is the correct outcome. Silent is not.
    expect(row.status).toBe('pending')
    expect(row.last_attempt_at).toBe(NOW)
    expect(row.last_attempt_outcome).toBe('unmeasured')
    // The sizer's own reason, which is what separates an expired token from a
    // truncated tree from a rate limit.
    expect(row.last_attempt_detail).toBe('tree-403')
  })

  it('records the error when enqueue throws', async () => {
    seed('explodes')

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      measureRepoSize: async () => ({ _tag: 'sized', skillCount: 3 }),
      enqueue: async () => {
        throw new Error('UNIQUE constraint failed: jobs.unique_key')
      },
    })

    expect(summary.failed).toBe(1)
    const row = attemptOf('explodes')
    expect(row.status).toBe('pending')
    expect(row.last_attempt_at).toBe(NOW)
    expect(row.last_attempt_outcome).toBe('error')
    expect(row.last_attempt_detail).toContain('UNIQUE constraint failed')
  })

  it('records the attempt on a repo that submits cleanly', async () => {
    seed('fine')

    await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      measureRepoSize: async () => ({ _tag: 'sized', skillCount: 3 }),
      enqueue: async () => ({ jobId: 'j', status: 'queued' }),
    })

    const row = attemptOf('fine')
    expect(row.status).toBe('submitted')
    expect(row.last_attempt_outcome).toBe('queued')
  })

  it('records the attempt on a parked repo', async () => {
    seed('huge')

    await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      skillLimit: 25,
      measureRepoSize: async () => ({ _tag: 'sized', skillCount: 400 }),
      enqueue: async () => ({ jobId: 'j', status: 'queued' }),
    })

    const row = attemptOf('huge')
    expect(row.last_attempt_outcome).toBe('oversized')
    expect(row.last_attempt_detail).toBe('400 skills')
  })

  /**
   * The invariant the whole file exists to protect: `considered` counts rows
   * the loop looked at, and every one of them must carry this run's timestamp
   * afterwards. Any future branch that forgets to record fails here.
   */
  it('leaves no considered row without a fresh attempt stamp', async () => {
    seed('a')
    seed('b')
    seed('c')

    let call = 0
    const summary = await submitDiscoveredRepos({
      db: db().db,
      env: {} as never,
      now: NOW,
      measureRepoSize: async () => {
        call += 1
        if (call === 1)
          return { _tag: 'unknown', reason: 'tree-403' }
        if (call === 2)
          return { _tag: 'gone' }
        return { _tag: 'sized', skillCount: 2 }
      },
      enqueue: async () => ({ jobId: 'j', status: 'queued' }),
    })

    const stamped = db().raw.prepare(
      `SELECT COUNT(*) AS n FROM discovery_ledger WHERE last_attempt_at = ?`,
    ).get(NOW) as { n: number }
    expect(stamped.n).toBe(summary.considered)
  })
})
