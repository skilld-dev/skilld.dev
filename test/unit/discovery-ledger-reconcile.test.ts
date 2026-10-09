import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { reconcileLedger } from '../../shared/server/discovery-ledger'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0101_discovery_ledger_size_guard.sql',
  'migrations/0106_discovery_ledger_attempts.sql',
  'migrations/0107_discovery_ledger_gone.sql',
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

/** The queue tables reconcileLedger joins, hand-built like the size-guard suite. */
function queueTables() {
  db().raw.exec(`CREATE TABLE IF NOT EXISTS jobs (job_type TEXT, payload TEXT, completed_at INTEGER, failed_at INTEGER)`)
  db().raw.exec(`CREATE TABLE IF NOT EXISTS failed_jobs (job_type TEXT, payload TEXT, exception TEXT, failed_at INTEGER)`)
  db().raw.exec(`CREATE TABLE IF NOT EXISTS skills (owner TEXT, repo TEXT, source_resolved INTEGER)`)
}

function seedSubmitted(owner: string, repo: string) {
  db().raw.prepare(
    `INSERT INTO discovery_ledger (source, owner, repo, evidence_url, evidence_text,
       evidence_score, first_seen_at, last_seen_at, mention_count, status, submitted_at)
     VALUES ('x', ?, ?, 'https://x.com/a/status/1', 'evidence', 100, ?, ?, 1, 'submitted', ?)`,
  ).run(owner, repo, NOW, NOW, NOW - 30 * 3600)
}

function deadLetter(owner: string, repo: string, exception: string) {
  db().raw.prepare(
    `INSERT INTO failed_jobs VALUES ('registry/repository-submission', ?, ?, ?)`,
  ).run(JSON.stringify({ owner, repo }), exception, NOW - 3600)
}

function ledgerRow(owner: string, repo: string) {
  return db().raw.prepare(
    `SELECT status, submitted_at, held_reason FROM discovery_ledger WHERE owner = ? AND repo = ?`,
  ).get(owner, repo) as { status: string, submitted_at: number | null, held_reason: string | null }
}

describe('reconcileLedger purpose hold', () => {
  /**
   * The purpose gate fails new submissions it cannot classify with
   * `repository_purpose_review_required`, and the job exhausts its retries into
   * `failed_jobs`. Before this branch the ledger row stayed `submitted` with a
   * dead-letter nothing reconciles, so five production rows (antfu/skills-pack
   * among them) alarmed as stalled every night instead of parking for the
   * review surface.
   */
  it('parks a purpose-held submission instead of letting it stall forever', async () => {
    queueTables()
    seedSubmitted('antfu', 'skills-pack')
    deadLetter('antfu', 'skills-pack', 'repository_purpose_review_required')

    const result = await reconcileLedger({ db: db().db, now: NOW })

    expect(result.heldPurpose).toBe(1)
    expect(result.stalled).toBe(0)
    expect(ledgerRow('antfu', 'skills-pack')).toEqual({
      status: 'pending',
      submitted_at: null,
      held_reason: 'repository_purpose_review_required',
    })
  })

  it('keeps parking distinct from the empty and retried dead-letter branches', async () => {
    queueTables()
    seedSubmitted('antfu', 'skills-pack')
    deadLetter('antfu', 'skills-pack', 'repository_purpose_review_required')
    seedSubmitted('nvm-sh', 'nvm')
    deadLetter('nvm-sh', 'nvm', 'no_supported_skill_paths')
    seedSubmitted('skcache', 'edn')
    deadLetter('skcache', 'edn', 'root_skill_unsupported')

    const result = await reconcileLedger({ db: db().db, now: NOW })

    expect(result.heldPurpose).toBe(1)
    expect(result.empty).toBe(1)
    expect(result.retried).toBe(1)
  })

  it('leaves a submission whose dead-letter names something else alone', async () => {
    queueTables()
    seedSubmitted('someone', 'flaky')
    deadLetter('someone', 'flaky', 'repo fetch 500')

    const result = await reconcileLedger({ db: db().db, now: NOW })

    expect(result.heldPurpose).toBe(0)
    expect(result.stalled).toBe(1)
    expect(ledgerRow('someone', 'flaky')).toEqual({
      status: 'submitted',
      submitted_at: NOW - 30 * 3600,
      held_reason: null,
    })
  })

  it('does not park a purpose-held repo that actually indexed', async () => {
    queueTables()
    seedSubmitted('late', 'winner')
    deadLetter('late', 'winner', 'repository_purpose_review_required')
    db().raw.prepare(`INSERT INTO skills VALUES ('late', 'winner', 1)`).run()

    const result = await reconcileLedger({ db: db().db, now: NOW })

    expect(result.indexed).toBe(1)
    expect(result.heldPurpose).toBe(0)
    expect(ledgerRow('late', 'winner').status).toBe('indexed')
  })

  it('parks a purpose-held row once, not again on every later run', async () => {
    queueTables()
    seedSubmitted('antfu', 'skills-pack')
    deadLetter('antfu', 'skills-pack', 'repository_purpose_review_required')

    await reconcileLedger({ db: db().db, now: NOW })
    const second = await reconcileLedger({ db: db().db, now: NOW + 900 })

    expect(second.heldPurpose).toBe(0)
    expect(second.stalled).toBe(0)
  })
})
