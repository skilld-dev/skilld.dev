import type { DailyHealthCheckSummary } from './daily-health-check'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCHEDULE_POLICY } from '#shared/schedule-policy'
import {
  buildDailyHealthCheck,
  evaluateDailyHealthStatus,
  frontDoorFetcher,
  loadFrontDoor,
  renderDailyHealthCheckHtml,
  renderDailyHealthCheckText,
  sendDailyHealthCheck,
} from './daily-health-check'

function summary(overrides: Partial<DailyHealthCheckSummary> = {}): DailyHealthCheckSummary {
  return {
    status: 'GREEN',
    reasons: ['All monitored systems are healthy.'],
    warnings: [],
    window: {
      reportDate: '2026-07-23',
      timeZone: 'Australia/Melbourne',
      from: '2026-07-21T22:00:00Z',
      to: '2026-07-22T22:00:00Z',
      workerVersion: null,
    },
    frontDoor: {
      checks: [
        { url: 'https://skilld.dev/', status: 200 },
        { url: 'https://skilld.dev/skills', status: 200 },
      ],
    },
    inventory: {
      skills: 3074,
      repos: 7363,
      owners: 9567,
      users: 20,
      collections: 10,
      watchedRepos: 30,
      brokenRepos: 1794,
    },
    activity: {
      newSkills24h: 3,
      repoChanges24h: 7,
      installEvents24h: 12,
      newUsers24h: 1,
      digestsSent24h: 4,
      digestsFailed24h: 0,
    },
    pipeline: {
      syncJobs: [{ name: 'sync-github-skills', status: 'ok', lastRunAt: 1_774_473_600, stale: false, error: null }],
      scheduledRuns: [{ taskName: 'sync-github-skills', health: { _tag: 'healthy', alertable: false } }],
      newlyBrokenReposTotal24h: 0,
      newlyBrokenReposImpacted24h: 0,
      skillSyncFailures24h: 0,
      staleDirtySkills: 0,
      aiBatchesSubmitted: 0,
      aiBatchesStuck: 0,
      aiBatchesFailed24h: 0,
      failedJobs24h: 0,
      staleReservedJobs: 0,
      openFailedBatches: 0,
      discoveryCandidatesExhausted: 0,
      discoveryCandidatesOverdue: 0,
      discoveryClaimsStale: 0,
      leaderboardApprovalsStuck: 0,
      failedJobDetails: [],
    },
    cost: {
      estimatedAiUsd24h: 0.12,
      estimatedAiUsdMonth: 2.34,
    },
    credentials: {
      githubToken: { _tag: 'healthy', daysRemaining: 89 },
    },
    ...overrides,
  }
}

function createDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE daily_health_checks (
      report_date TEXT PRIMARY KEY,
      health_status TEXT NOT NULL,
      delivery_status TEXT NOT NULL,
      recipient TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      sent_at INTEGER,
      message_id TEXT,
      error TEXT,
      summary_json TEXT NOT NULL
    )
  `)

  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = []
      const statement = {
        bind(...values: unknown[]) {
          bindings = values
          return statement
        },
        async run() {
          const prepared = expandNumberedPlaceholders(sql, bindings)
          const result = sqlite.prepare(prepared.sql).run(...prepared.bindings)
          return { success: true, meta: { changes: result.changes } }
        },
        async all<T>() {
          const prepared = expandNumberedPlaceholders(sql, bindings)
          return { results: sqlite.prepare(prepared.sql).all(...prepared.bindings) as T[] }
        },
        async first<T>() {
          const prepared = expandNumberedPlaceholders(sql, bindings)
          return (sqlite.prepare(prepared.sql).get(...prepared.bindings) as T | undefined) ?? null
        },
      }
      return statement
    },
  } as unknown as D1Database

  return { db, sqlite }
}

function expandNumberedPlaceholders(sql: string, bindings: unknown[]): { sql: string, bindings: unknown[] } {
  const expanded: unknown[] = []
  const normalized = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(bindings[Number(raw) - 1])
    return '?'
  })
  return { sql: normalized, bindings: expanded.length ? expanded : bindings }
}

describe('evaluateDailyHealthStatus', () => {
  it('keeps the quiet baseline green', () => {
    const input = summary()
    expect(evaluateDailyHealthStatus(input)).toEqual({
      status: 'GREEN',
      reasons: ['All monitored systems are healthy.'],
    })
  })

  it('marks a homepage outage red', () => {
    const input = summary({
      frontDoor: { checks: [{ url: 'https://skilld.dev/', status: 503 }] },
    })
    expect(evaluateDailyHealthStatus(input)).toEqual({
      status: 'RED',
      reasons: ['Homepage returned HTTP 503.'],
    })
  })

  it('marks failed digest delivery red and stalled AI amber', () => {
    const failed = summary({ activity: { ...summary().activity, digestsFailed24h: 2 } })
    expect(evaluateDailyHealthStatus(failed).status).toBe('RED')

    const stalled = summary({ pipeline: { ...summary().pipeline, aiBatchesStuck: 1 } })
    expect(evaluateDailyHealthStatus(stalled)).toEqual({
      status: 'AMBER',
      reasons: ['1 AI batch has been submitted for over 3 hours.'],
    })
  })

  it('surfaces exhausted and stalled discovery retries', () => {
    const input = summary({
      pipeline: {
        ...summary().pipeline,
        discoveryCandidatesExhausted: 2,
        discoveryCandidatesOverdue: 3,
        discoveryClaimsStale: 1,
      },
    })

    expect(evaluateDailyHealthStatus(input)).toEqual({
      status: 'AMBER',
      reasons: [
        '2 discovery candidates exhausted automatic retries.',
        '3 discovery candidates are overdue for retry.',
        '1 discovery claim remained active for over 1 hour.',
      ],
    })
  })

  it('alerts when reviewed leaderboard repositories remain invisible', () => {
    const input = summary({
      pipeline: {
        ...summary().pipeline,
        leaderboardApprovalsStuck: 2,
      },
    })

    expect(evaluateDailyHealthStatus(input)).toEqual({
      status: 'AMBER',
      reasons: ['2 reviewed leaderboard repositories remained invisible for over 15 minutes.'],
    })
  })

  it('keeps unengaged source removal informational and flags user impact amber', () => {
    const informational = summary({
      pipeline: {
        ...summary().pipeline,
        newlyBrokenReposTotal24h: 1,
        newlyBrokenReposImpacted24h: 0,
      },
    })
    expect(evaluateDailyHealthStatus(informational)).toEqual({
      status: 'GREEN',
      reasons: ['All monitored systems are healthy.'],
    })

    const impacted = summary({
      pipeline: {
        ...informational.pipeline,
        newlyBrokenReposImpacted24h: 1,
      },
    })
    expect(evaluateDailyHealthStatus(impacted)).toEqual({
      status: 'AMBER',
      reasons: ['1 user-impacting repository became unavailable in 24 hours.'],
    })
  })

  it('marks missing scheduled cadence red', () => {
    const missing = summary({
      pipeline: {
        ...summary().pipeline,
        scheduledRuns: [{ taskName: 'sync-github-skills', health: { _tag: 'missing_run', alertable: true } }],
      },
    })
    expect(evaluateDailyHealthStatus(missing)).toEqual({
      status: 'RED',
      reasons: ['Scheduled run history is unhealthy: sync-github-skills (missing_run).'],
    })
  })
})

describe('buildDailyHealthCheck', () => {
  it('loads the production-shaped D1 metrics with their correct timestamp units', async () => {
    const { db, sqlite } = createDb()
    const now = new Date('2026-07-22T22:05:00Z')
    const nowSec = Math.floor(now.getTime() / 1000)
    sqlite.exec(`
      CREATE TABLE skills (owner TEXT, repo TEXT, name TEXT, first_seen_at INTEGER, sync_status TEXT, last_synced_at INTEGER);
      CREATE TABLE repos (owner TEXT, repo TEXT, broken_since INTEGER);
      CREATE TABLE owners (owner TEXT, kind TEXT);
      CREATE TABLE users (created_at INTEGER);
      CREATE TABLE collections_v2 (deleted_at INTEGER);
      CREATE TABLE user_starred_repos (owner TEXT, repo TEXT);
      CREATE TABLE skill_subscriptions (owner TEXT, repo TEXT);
      CREATE TABLE collection_skills_v2 (owner TEXT, repo TEXT);
      CREATE TABLE activity (owner TEXT, repo TEXT, name TEXT, occurred_at INTEGER);
      CREATE TABLE install_events (slug TEXT, occurred_at INTEGER);
      CREATE TABLE digest_runs (
        status TEXT,
        sent_at INTEGER,
        window_end INTEGER,
        finished_at INTEGER,
        sending_at INTEGER
      );
      CREATE TABLE skill_dirty (queued_at INTEGER);
      CREATE TABLE ai_batches (status TEXT, submitted_at INTEGER, completed_at INTEGER);
      CREATE TABLE failed_jobs (queue TEXT, job_type TEXT, exception TEXT, failed_at INTEGER);
      CREATE TABLE jobs (reserved_at INTEGER, completed_at INTEGER, failed_at INTEGER);
      CREATE TABLE job_batches (failed_jobs INTEGER, finished_at INTEGER);
      CREATE TABLE discovery_candidates (
        retry_state TEXT,
        outcome TEXT,
        rejection_reason TEXT,
        next_retry_at INTEGER,
        claimed_at INTEGER
      );
      CREATE TABLE skill_repo_eligibility (
        owner TEXT,
        repo TEXT,
        status TEXT,
        reason TEXT,
        reviewed_by TEXT,
        reviewed_at INTEGER
      );
      CREATE TABLE sync_jobs (name TEXT, cron TEXT, enabled INTEGER, stale_after_seconds INTEGER, last_run_at INTEGER, last_status TEXT, last_error TEXT);
      CREATE TABLE scheduled_runs (
        run_id TEXT PRIMARY KEY,
        task_name TEXT,
        status TEXT,
        started_at INTEGER,
        expires_at INTEGER,
        finished_at INTEGER,
        error TEXT
      );
      CREATE INDEX idx_scheduled_runs_task_latest
        ON scheduled_runs(task_name, started_at DESC, run_id DESC);
      CREATE TABLE ai_batch_costs (submitted_at INTEGER, est_cost_usd REAL);

      INSERT INTO skills VALUES ('owner', 'repo', 'skill', ${nowSec - 60}, 'ok', ${nowSec - 60});
      INSERT INTO repos VALUES ('owner', 'repo', NULL);
      INSERT INTO repos VALUES ('deleted-owner', 'deleted-repo', ${nowSec - 60});
      INSERT INTO owners VALUES ('owner', 'user');
      INSERT INTO users VALUES (${nowSec - 60});
      INSERT INTO collections_v2 VALUES (NULL);
      INSERT INTO user_starred_repos VALUES ('owner', 'repo');
      INSERT INTO activity VALUES ('owner', 'repo', 'skill', ${nowSec - 60});
      INSERT INTO install_events VALUES ('owner/skill', ${now.getTime() - 60_000});
      INSERT INTO digest_runs VALUES ('sent', ${nowSec - 60}, ${nowSec - 60}, ${nowSec - 60}, ${nowSec - 60});
      INSERT INTO sync_jobs VALUES ('sync-github-skills', '0 * * * *', 1, NULL, ${nowSec - 60}, 'ok', NULL);
      INSERT INTO ai_batch_costs VALUES (${nowSec - 60}, 0.15);
      INSERT INTO discovery_candidates VALUES (
        'exhausted', 'rejected', 'no_supported_skill_paths', NULL, NULL
      );
      -- A rejection is a decision whatever its reason; dynamic reasons like a
      -- parse failure's path can never match a static reason list, so the alarm
      -- must key on the outcome, not the reason.
      INSERT INTO discovery_candidates VALUES (
        'exhausted', 'rejected', 'skill_parse_rejected:skills/one/SKILL.md', NULL, NULL
      );
    `)
    const insertScheduledRun = sqlite.prepare(`
      INSERT INTO scheduled_runs (
        run_id, task_name, status, started_at, expires_at, finished_at, error
      ) VALUES (?, ?, 'succeeded', ?, ?, ?, NULL)
    `)
    for (const policy of SCHEDULE_POLICY) {
      insertScheduledRun.run(
        `run-${policy.taskName}`,
        policy.taskName,
        nowSec - 60,
        nowSec + 60,
        nowSec - 30,
      )
    }

    const fetcher = vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch
    const built = await buildDailyHealthCheck(db, { now, fetcher, workerVersion: 'version-1' })

    expect(built.status).toBe('GREEN')
    expect(built.warnings).toEqual([])
    expect(built.inventory).toMatchObject({ skills: 1, repos: 2, users: 1, watchedRepos: 1 })
    expect(built.activity).toMatchObject({ newSkills24h: 1, repoChanges24h: 1, installEvents24h: 1, digestsSent24h: 1 })
    expect(built.pipeline).toMatchObject({
      newlyBrokenReposTotal24h: 1,
      newlyBrokenReposImpacted24h: 0,
    })
    expect(built.pipeline.discoveryCandidatesExhausted).toBe(0)
    expect(built.pipeline.leaderboardApprovalsStuck).toBe(0)
    expect(built.cost.estimatedAiUsd24h).toBe(0.15)

    sqlite.exec(`
      INSERT INTO digest_runs VALUES ('uncertain', NULL, ${nowSec - 90_000}, ${nowSec - 90_000}, ${nowSec - 90_000});
      INSERT INTO discovery_candidates VALUES (
        'exhausted', 'retryable_failure', NULL, NULL, NULL
      );
      INSERT INTO skill_repo_eligibility VALUES (
        'missing-owner', 'missing-repo', 'eligible', 'Reviewed purpose', 'test',
        ${nowSec - 901}
      );
      INSERT INTO owners VALUES ('missing-owner', 'user');
      INSERT INTO owners VALUES ('organization', 'org');
      INSERT INTO skill_repo_eligibility VALUES (
        'organization', 'missing-repo', 'eligible', 'Reviewed purpose', 'test',
        ${nowSec - 901}
      );
    `)
    const uncertain = await buildDailyHealthCheck(db, { now, fetcher, workerVersion: 'version-1' })
    expect(uncertain.activity.digestsFailed24h).toBe(1)
    expect(uncertain.pipeline.discoveryCandidatesExhausted).toBe(1)
    expect(uncertain.pipeline.leaderboardApprovalsStuck).toBe(1)
    expect(uncertain.status).toBe('RED')
    sqlite.close()
  })
})

describe('daily health rendering', () => {
  it('renders text and escapes untrusted HTML', () => {
    const input = summary({
      reasons: ['Pipeline <degraded>'],
      pipeline: {
        ...summary().pipeline,
        failedJobDetails: [{ queue: 'sync', jobType: '<script>', exception: 'boom & burn', count: 2 }],
      },
    })

    expect(renderDailyHealthCheckText(input)).toContain('skilld daily health check: GREEN')
    expect(renderDailyHealthCheckHtml(input)).toContain('Pipeline &lt;degraded&gt;')
    expect(renderDailyHealthCheckHtml(input)).not.toContain('<script>')
  })
})

describe('sendDailyHealthCheck', () => {
  const sqliteDbs: Database.Database[] = []

  afterEach(() => {
    sqliteDbs.splice(0).forEach(db => db.close())
  })

  it('claims the report date before sending and deduplicates retries', async () => {
    const { db, sqlite } = createDb()
    sqliteDbs.push(sqlite)
    const send = vi.fn().mockResolvedValue({
      _tag: 'accepted',
      messageId: 'msg_1',
    })
    const build = vi.fn().mockResolvedValue(summary())
    const input = { now: new Date('2026-07-22T22:05:00Z'), to: 'ops@example.com', build, send }

    await expect(sendDailyHealthCheck(db, input)).resolves.toMatchObject({ _tag: 'Sent', messageId: 'msg_1' })
    await expect(sendDailyHealthCheck(db, input)).resolves.toMatchObject({ _tag: 'Duplicate' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('records a failed delivery and allows a retry', async () => {
    const { db, sqlite } = createDb()
    sqliteDbs.push(sqlite)
    const send = vi.fn()
      .mockResolvedValueOnce({
        _tag: 'rejected',
        error: 'temporary failure',
      })
      .mockResolvedValueOnce({
        _tag: 'accepted',
        messageId: 'msg_2',
      })
    const input = {
      now: new Date('2026-07-22T22:05:00Z'),
      to: 'ops@example.com',
      build: vi.fn().mockResolvedValue(summary()),
      send,
    }

    await expect(sendDailyHealthCheck(db, input)).resolves.toMatchObject({ _tag: 'SendFailed', error: 'temporary failure' })
    await expect(sendDailyHealthCheck(db, input)).resolves.toMatchObject({ _tag: 'Sent', messageId: 'msg_2' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('leaves uncertain delivery in sending so a duplicate cannot resend', async () => {
    const { db, sqlite } = createDb()
    sqliteDbs.push(sqlite)
    const send = vi.fn().mockResolvedValue({
      _tag: 'uncertain',
      error: 'provider acknowledgement malformed',
    })
    const input = {
      now: new Date('2026-07-22T22:05:00Z'),
      to: 'ops@example.com',
      build: vi.fn().mockResolvedValue(summary()),
      send,
    }

    await expect(sendDailyHealthCheck(db, input)).resolves.toMatchObject({
      _tag: 'Uncertain',
      error: 'provider acknowledgement malformed',
    })
    await expect(sendDailyHealthCheck(db, input)).resolves.toMatchObject({ _tag: 'Duplicate' })
    expect(sqlite.prepare(
      `SELECT delivery_status, error FROM daily_health_checks`,
    ).get()).toEqual({ delivery_status: 'sending', error: null })
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('frontDoorFetcher', () => {
  it('probes through the SELF binding rather than the public URL', async () => {
    const selfFetch = vi.fn().mockResolvedValue({ status: 200 })
    const fetcher = frontDoorFetcher({ SELF: { fetch: selfFetch } as unknown as Fetcher })

    const result = await loadFrontDoor(fetcher, { attempts: 1 })

    expect(result.checks.every(check => check.status === 200)).toBe(true)
    expect(selfFetch).toHaveBeenCalledTimes(3)
    expect(selfFetch.mock.calls.map(call => call[0])).toEqual([
      'https://skilld.dev/',
      'https://skilld.dev/skills',
      'https://skilld.dev/guides',
    ])
  })

  it('reports a missing binding as a failed probe instead of falling back to the 522 path', async () => {
    const fetcher = frontDoorFetcher({})

    const result = await loadFrontDoor(fetcher, { attempts: 1 })

    expect(result.checks).toEqual([
      { url: 'https://skilld.dev/', status: null },
      { url: 'https://skilld.dev/skills', status: null },
      { url: 'https://skilld.dev/guides', status: null },
    ])
    expect(evaluateDailyHealthStatus(summary({ frontDoor: result }))).toMatchObject({ status: 'RED' })
  })
})

describe('verdict reason completeness', () => {
  // 2026-07-25: the operator email's only reason was "Homepage returned HTTP 522",
  // a self-fetch artefact, while sync-github-skills was degrading underneath it.
  // Amber reasons were computed and then discarded because a red existed, so the
  // real problem stayed invisible for two days.
  it('keeps amber reasons visible when the verdict is red', () => {
    const input = summary({
      frontDoor: { checks: [{ url: 'https://skilld.dev/', status: 522 }] },
      pipeline: {
        ...summary().pipeline,
        syncJobs: [
          { name: 'sync-github-skills', status: 'partial', lastRunAt: 1, stale: false, error: 'failed=4' },
        ],
        staleDirtySkills: 3,
      },
    })

    const result = evaluateDailyHealthStatus(input)

    expect(result.status).toBe('RED')
    expect(result.reasons).toContain('Homepage returned HTTP 522.')
    expect(result.reasons.some(r => r.includes('sync-github-skills'))).toBe(true)
    expect(result.reasons.some(r => r.includes('dirty skill'))).toBe(true)
  })

  it('orders red reasons before amber ones', () => {
    const input = summary({
      activity: { ...summary().activity, digestsFailed24h: 1 },
      pipeline: { ...summary().pipeline, staleDirtySkills: 1 },
    })

    const result = evaluateDailyHealthStatus(input)

    expect(result.reasons[0]).toContain('digest delivery')
    expect(result.reasons.at(-1)).toContain('dirty skill')
  })

  // A rejected credential took the whole GitHub pipeline down for two days.
  // "Scheduled tasks failed: sync-github-skills" does not tell the operator to
  // rotate a token, so the actionable error text has to reach the email.
  it('names a rejected credential instead of only the task', () => {
    const input = summary({
      pipeline: {
        ...summary().pipeline,
        syncJobs: [{
          name: 'sync-github-skills',
          status: 'error',
          lastRunAt: 1,
          stale: false,
          error: 'github credential rejected (401): rotate GITHUB_TOKEN',
        }],
      },
    })

    const result = evaluateDailyHealthStatus(input)

    expect(result.status).toBe('RED')
    expect(result.reasons.some(r => r.includes('rotate GITHUB_TOKEN'))).toBe(true)
  })
})

describe('credential expiry gate', () => {
  it('stays quiet while the token has plenty of life', () => {
    const input = summary({ credentials: { githubToken: { _tag: 'healthy', daysRemaining: 89 } } })
    expect(evaluateDailyHealthStatus(input).status).toBe('GREEN')
  })

  it('warns inside the renewal window, while there is still time to act', () => {
    const input = summary({ credentials: { githubToken: { _tag: 'expiring', daysRemaining: 10 } } })
    const result = evaluateDailyHealthStatus(input)
    expect(result.status).toBe('AMBER')
    expect(result.reasons.some(r => r.includes('10 days'))).toBe(true)
  })

  it('goes red once the deadline passes, which is the outage we already had', () => {
    const input = summary({ credentials: { githubToken: { _tag: 'expired', daysRemaining: -3 } } })
    const result = evaluateDailyHealthStatus(input)
    expect(result.status).toBe('RED')
    expect(result.reasons.some(r => r.includes('GITHUB_TOKEN'))).toBe(true)
  })

  it('says nothing when the expiry could not be read', () => {
    const input = summary({ credentials: { githubToken: { _tag: 'unknown' } } })
    expect(evaluateDailyHealthStatus(input).status).toBe('GREEN')
  })
})
