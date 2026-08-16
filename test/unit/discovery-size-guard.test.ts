// @vitest-environment node
import type { MeasureRepoSize } from '../../shared/server/discovery-size-guard'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { reconcileLedger, submitDiscoveredRepos } from '../../shared/server/discovery-ledger'
import { AUTO_INDEX_SKILL_LIMIT } from '../../shared/server/discovery-size-guard'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0097_x_mentions_and_discovery_ledger.sql',
  'migrations/0101_discovery_ledger_size_guard.sql',
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

function seedPending(owner: string, repo: string, evidenceScore = 100) {
  db().raw.prepare(
    `INSERT INTO discovery_ledger (source, owner, repo, evidence_url, evidence_text,
       evidence_score, first_seen_at, last_seen_at, mention_count, status)
     VALUES ('x', ?, ?, 'https://x.com/a/status/1', 'evidence', ?, ?, ?, 1, 'pending')`,
  ).run(owner, repo, evidenceScore, NOW, NOW)
}

/** Sizer returning a fixed count per repo, or 'unknown' for anything unlisted. */
function sizer(counts: Record<string, number>): MeasureRepoSize {
  return async ({ owner, repo }) => {
    const n = counts[`${owner}/${repo}`]
    return n === undefined
      ? { _tag: 'unknown', reason: 'not-in-fixture' }
      : { _tag: 'sized', skillCount: n }
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

const env = {} as never

describe('auto-index size guard', () => {
  it('submits a normally sized repo', async () => {
    seedPending('kepano', 'obsidian-skills')
    const { calls, enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue,
      measureRepoSize: sizer({ 'kepano/obsidian-skills': 5 }),
    })

    expect(summary.queued).toBe(1)
    expect(calls).toEqual(['kepano/obsidian-skills'])
    const row = db().raw.prepare(`SELECT status, skill_count, held_reason FROM discovery_ledger`).get()
    expect(row).toEqual({ status: 'submitted', skill_count: 5, held_reason: null })
  })

  it('parks an aggregator dump instead of indexing it', async () => {
    // sickn33/agentic-awesome-skills really holds 6,341 SKILL.md files, against
    // a largest-curated-repo of 18. Indexing it would bury the registry.
    seedPending('sickn33', 'agentic-awesome-skills')
    const { calls, enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue,
      measureRepoSize: sizer({ 'sickn33/agentic-awesome-skills': 6341 }),
    })

    expect(summary.heldOversized).toBe(1)
    expect(summary.queued).toBe(0)
    expect(calls).toEqual([])
    const row = db().raw.prepare(`SELECT status, skill_count, held_reason FROM discovery_ledger`).get()
    expect(row).toEqual({ status: 'pending', skill_count: 6341, held_reason: 'oversized' })
  })

  it('admits a repo sitting exactly on the limit', async () => {
    seedPending('edge', 'case')
    const { enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue,
      measureRepoSize: sizer({ 'edge/case': AUTO_INDEX_SKILL_LIMIT }),
    })

    expect(summary.queued).toBe(1)
  })

  it('parks the first repo over the limit', async () => {
    seedPending('edge', 'over')
    const { enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue,
      measureRepoSize: sizer({ 'edge/over': AUTO_INDEX_SKILL_LIMIT + 1 }),
    })

    expect(summary.heldOversized).toBe(1)
  })

  it('does not re-measure a repo already parked', async () => {
    seedPending('sickn33', 'agentic-awesome-skills')
    const first = recordingEnqueue()
    await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue: first.enqueue,
      measureRepoSize: sizer({ 'sickn33/agentic-awesome-skills': 6341 }),
    })

    let measured = 0
    const counting: MeasureRepoSize = async () => {
      measured += 1
      return { _tag: 'sized', skillCount: 6341 }
    }
    const second = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW + 900,
      enqueue: first.enqueue,
      measureRepoSize: counting,
    })

    expect(measured).toBe(0)
    expect(second.considered).toBe(0)
  })

  it('fails closed when size cannot be measured', async () => {
    // The likely cause is an expired GitHub token. Treating unknown as small
    // would wave every aggregator straight through on the day auth breaks.
    seedPending('unknown', 'repo')
    const { calls, enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue,
      measureRepoSize: sizer({}),
    })

    expect(summary.deferredUnmeasured).toBe(1)
    expect(summary.queued).toBe(0)
    expect(calls).toEqual([])
  })

  it('retries an unmeasurable repo on the next run rather than parking it', async () => {
    seedPending('flaky', 'repo')
    const { enqueue } = recordingEnqueue()
    await submitDiscoveredRepos({ db: db().db, env, now: NOW, enqueue, measureRepoSize: sizer({}) })

    const recovered = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW + 900,
      enqueue,
      measureRepoSize: sizer({ 'flaky/repo': 3 }),
    })
    expect(recovered.queued).toBe(1)
  })

  it('submits nothing at all when no sizer is configured', async () => {
    seedPending('any', 'repo')
    const { calls, enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({ db: db().db, env, now: NOW, enqueue })

    expect(summary.queued).toBe(0)
    expect(summary.deferredUnmeasured).toBe(1)
    expect(calls).toEqual([])
  })

  it('keeps parked repos out of the submit queue while admitting the rest', async () => {
    seedPending('big', 'dump', 900)
    seedPending('small', 'one', 800)
    seedPending('small', 'two', 700)
    const { calls, enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue,
      measureRepoSize: sizer({ 'big/dump': 6341, 'small/one': 4, 'small/two': 11 }),
    })

    expect(summary.heldOversized).toBe(1)
    expect(summary.queued).toBe(2)
    expect(calls.sort()).toEqual(['small/one', 'small/two'])
  })
})

describe('reconcileLedger empty rule', () => {
  it('never empties a row whose submission job has not finished', async () => {
    // The bug this replaces marked any row submitted >6h ago as empty, which
    // silently discarded cathrynlavery/diagram-design (13,254 stars, one
    // SKILL.md) while its job sat unstarted. Empty is terminal, so it never
    // came back.
    db().raw.exec(`CREATE TABLE IF NOT EXISTS jobs (job_type TEXT, payload TEXT, completed_at INTEGER, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS failed_jobs (job_type TEXT, payload TEXT, exception TEXT, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS skills (owner TEXT, repo TEXT, source_resolved INTEGER)`)
    seedPending('cathrynlavery', 'diagram-design')
    db().raw.prepare(`UPDATE discovery_ledger SET status='submitted', submitted_at=?`).run(NOW - 30 * 3600)
    db().raw.prepare(`INSERT INTO jobs VALUES ('registry/repository-submission', ?, NULL, NULL)`).run(JSON.stringify({ owner: 'cathrynlavery', repo: 'diagram-design' }))

    const result = await reconcileLedger({ db: db().db, now: NOW })

    expect(result.empty).toBe(0)
    expect(result.stalled).toBe(1)
    expect(db().raw.prepare(`SELECT status FROM discovery_ledger`).get()).toEqual({ status: 'submitted' })
  })

  it('empties a row once its job finished and found nothing', async () => {
    db().raw.exec(`CREATE TABLE IF NOT EXISTS jobs (job_type TEXT, payload TEXT, completed_at INTEGER, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS failed_jobs (job_type TEXT, payload TEXT, exception TEXT, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS skills (owner TEXT, repo TEXT, source_resolved INTEGER)`)
    seedPending('someone', 'empty-repo')
    db().raw.prepare(`UPDATE discovery_ledger SET status='submitted', submitted_at=?`).run(NOW - 30 * 3600)
    db().raw.prepare(`INSERT INTO jobs VALUES ('registry/repository-submission', ?, ?, NULL)`).run(JSON.stringify({ owner: 'someone', repo: 'empty-repo' }), NOW - 3600)

    const result = await reconcileLedger({ db: db().db, now: NOW })
    expect(result.empty).toBe(1)
  })

  /**
   * A dead-lettered job leaves no row in `jobs` at all, so the finished-job
   * test above could never see it and 42 rows sat `submitted` forever.
   * Measured in production on 2026-08-16: every one of them was already in
   * `repos` with `repo_skill_count = 0`, and 62 dead-letters carried
   * `no_supported_skill_paths`. The queue exhausted its retries; the answer is
   * simply that the repository has no skills.
   */
  it('empties a row whose submission exhausted its retries finding no skills', async () => {
    db().raw.exec(`CREATE TABLE IF NOT EXISTS jobs (job_type TEXT, payload TEXT, completed_at INTEGER, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS failed_jobs (job_type TEXT, payload TEXT, exception TEXT, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS skills (owner TEXT, repo TEXT, source_resolved INTEGER)`)
    seedPending('nvm-sh', 'nvm')
    db().raw.prepare(`UPDATE discovery_ledger SET status='submitted', submitted_at=?`).run(NOW - 30 * 3600)
    db().raw.prepare(`INSERT INTO failed_jobs VALUES ('registry/repository-submission', ?, 'no_supported_skill_paths', ?)`)
      .run(JSON.stringify({ owner: 'nvm-sh', repo: 'nvm' }), NOW - 3600)

    const result = await reconcileLedger({ db: db().db, now: NOW })

    expect(result.empty).toBe(1)
    expect(result.stalled).toBe(0)
  })

  /**
   * `root_skill_unsupported` was the indexer refusing a repository whose
   * SKILL.md sits at the root. That refusal was deleted in bcc8213, so the
   * verdict describes code that no longer exists. Twelve production rows carry
   * it, and every one is a repository the registry should hold.
   */
  it('retries a row rejected by a verdict the indexer no longer makes', async () => {
    db().raw.exec(`CREATE TABLE IF NOT EXISTS jobs (job_type TEXT, payload TEXT, completed_at INTEGER, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS failed_jobs (job_type TEXT, payload TEXT, exception TEXT, failed_at INTEGER)`)
    db().raw.exec(`CREATE TABLE IF NOT EXISTS skills (owner TEXT, repo TEXT, source_resolved INTEGER)`)
    seedPending('skcache', 'edn')
    db().raw.prepare(`UPDATE discovery_ledger SET status='submitted', submitted_at=?`).run(NOW - 30 * 3600)
    db().raw.prepare(`INSERT INTO failed_jobs VALUES ('registry/repository-submission', ?, 'root_skill_unsupported', ?)`)
      .run(JSON.stringify({ owner: 'skcache', repo: 'edn' }), NOW - 3600)

    const result = await reconcileLedger({ db: db().db, now: NOW })

    // Back to pending so the normal submit path picks it up, not straight to
    // indexed: the guard still has to measure it.
    expect(result.retried).toBe(1)
    expect(result.empty).toBe(0)
    const row = db().raw.prepare(`SELECT status, submitted_at FROM discovery_ledger`).get() as { status: string, submitted_at: number | null }
    expect(row.status).toBe('pending')
    expect(row.submitted_at).toBeNull()
  })
})

describe('deleted repositories', () => {
  it('parks a repo that no longer exists instead of retrying forever', async () => {
    // 0xwilliamortiz/claude-red drew 162 likes and was then deleted. Treating
    // 404 as "unknown" retried it every quarter hour for nothing.
    seedPending('0xwilliamortiz', 'claude-red')
    const { calls, enqueue } = recordingEnqueue()

    const summary = await submitDiscoveredRepos({
      db: db().db,
      env,
      now: NOW,
      enqueue,
      measureRepoSize: async () => ({ _tag: 'gone' }),
    })

    expect(summary.heldGone).toBe(1)
    expect(summary.deferredUnmeasured).toBe(0)
    expect(calls).toEqual([])
    expect(db().raw.prepare(`SELECT held_reason FROM discovery_ledger`).get())
      .toEqual({ held_reason: 'repo-gone' })
  })
})
