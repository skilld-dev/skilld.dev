import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadDigestEligibleUsers } from '../../layers/identity/server/utils/digest-select'
import { loadWeeklyRecipients } from '../../layers/identity/server/utils/weekly-select'
import { createSqliteD1 } from './helpers/d1-sqlite'

describe('d1 migration bootstrap', () => {
  function allMigrationNames(): string[] {
    return readdirSync(resolve(process.cwd(), 'migrations'))
      .filter(file => file.endsWith('.sql'))
      .sort()
  }

  it('applies the complete migration history to an empty database', () => {
    const sqlite = new Database(':memory:')
    const migrationsDir = resolve(process.cwd(), 'migrations')
    const migrations = allMigrationNames()

    try {
      for (const migration of migrations) {
        if (migration === '0033_skills_repo_in_key.sql') {
          sqlite.exec(`
            INSERT INTO skills (name, owner, repo, display_name, slug, description)
            VALUES ('migration-check', 'skilld-dev', 'skills', 'Migration Check', 'skilld-dev/migration-check', 'preserved');
          `)
        }
        if (migration === '0088_skill_labels_from_source.sql') {
          sqlite.exec(`
            INSERT INTO repos (owner, repo) VALUES ('label-test', 'skills');
            INSERT INTO skills (
              owner, repo, name, display_name, slug, rendered_frontmatter
            ) VALUES
              ('label-test', 'skills', 'slug-name', 'Slug Name', 'label-test/slug-name', '{"name":"source-name"}'),
              ('label-test', 'skills', 'source-acronym', 'Source Acronym', 'label-test/source-acronym', '{"name":"API"}'),
              ('label-test', 'skills', 'missing-name', 'Missing Name', 'label-test/missing-name', '{"description":"No name"}'),
              ('label-test', 'skills', 'invalid-cache', 'Invalid Cache', 'label-test/invalid-cache', 'invalid json');
          `)
        }
        sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))
      }

      const skillColumns = sqlite.prepare('PRAGMA table_info(skills)').all() as Array<{ name: string }>
      const skillColumnNames = skillColumns.map(column => column.name)
      expect(skillColumnNames).toContain('owner_verified')
      expect(skillColumnNames).toContain('rendered_raw_sha256')
      expect(skillColumnNames).not.toContain('stars')
      expect(sqlite.prepare(
        `SELECT owner, repo, description FROM skills WHERE name = 'migration-check'`,
      ).get()).toEqual({ owner: 'skilld-dev', repo: 'skills', description: 'preserved' })
      expect(sqlite.prepare(`
        SELECT name, display_name
        FROM skills
        WHERE owner = 'label-test'
        ORDER BY name
      `).all()).toEqual([
        { name: 'invalid-cache', display_name: 'invalid-cache' },
        { name: 'missing-name', display_name: 'missing-name' },
        { name: 'slug-name', display_name: 'source-name' },
        { name: 'source-acronym', display_name: 'API' },
      ])

      const pendingIndex = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_ai_ready_pages_indexnow_pending'`,
      ).get()
      expect(pendingIndex).toBeTruthy()

      const cfJobTables = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name IN ('job_batches', 'jobs', 'failed_jobs')
         ORDER BY name`,
      ).all() as Array<{ name: string }>
      expect(cfJobTables.map(table => table.name)).toEqual(['failed_jobs', 'job_batches', 'jobs'])

      const cfJobActiveIndex = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_jobs_active'`,
      ).get()
      expect(cfJobActiveIndex).toBeTruthy()
      const cfJobClaimIndex = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_jobs_claimable'`,
      ).get()
      expect(cfJobClaimIndex).toBeUndefined()
      const cfJobColumns = sqlite.prepare(`PRAGMA table_info(jobs)`).all() as Array<{ name: string }>
      expect(cfJobColumns.map(column => column.name)).toEqual(expect.arrayContaining([
        'backoff',
        'published_at',
        'last_dispatched_at',
        'dispatch_attempts',
        'last_dispatch_error',
      ]))

      const healthCheckTable = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name = 'daily_health_checks'`,
      ).get()
      expect(healthCheckTable).toBeTruthy()

      const discoveryCandidate = sqlite.prepare(
        `SELECT sql FROM sqlite_schema
         WHERE type = 'table' AND name = 'discovery_candidates'`,
      ).get() as { sql: string } | undefined
      expect(discoveryCandidate?.sql).toContain('first_discovered_at')
      expect(discoveryCandidate?.sql).toContain('rejection_reason')
      expect(discoveryCandidate?.sql).toContain('retry_state')

      const validCandidatePrefix = `
        INSERT INTO discovery_candidates (
          owner, repo, source, first_discovered_at, last_discovered_at,
          outcome, rejection_reason, last_error, retry_state, next_retry_at,
          claimed_at, claim_token
        )`
      const invalidCandidates = [
        `VALUES ('invalid', 'ready-indexed', 'manual', 1, 1, 'indexed', NULL, NULL, 'ready', NULL, NULL, NULL)`,
        `VALUES ('invalid', 'retry-pending', 'manual', 1, 1, 'pending', NULL, NULL, 'retry_scheduled', 2, NULL, NULL)`,
        `VALUES ('invalid', 'complete-rejected', 'manual', 1, 1, 'rejected', 'reason', NULL, 'complete', NULL, NULL, NULL)`,
        `VALUES ('invalid', 'rejected-no-reason', 'manual', 1, 1, 'rejected', NULL, NULL, 'exhausted', NULL, NULL, NULL)`,
        `VALUES ('invalid', 'failure-no-error', 'manual', 1, 1, 'retryable_failure', NULL, NULL, 'exhausted', NULL, NULL, NULL)`,
        `VALUES ('invalid', 'ready-next-retry', 'manual', 1, 1, 'pending', NULL, NULL, 'ready', 2, NULL, NULL)`,
        `VALUES ('invalid', 'claimed-no-token', 'manual', 1, 1, 'pending', NULL, NULL, 'claimed', NULL, 2, NULL)`,
      ]
      for (const values of invalidCandidates)
        expect(() => sqlite.exec(`${validCandidatePrefix} ${values}`)).toThrow()

      const discoveryDueIndex = sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_discovery_candidates_due'`,
      ).get()
      expect(discoveryDueIndex).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_activity_sync_dedupe'`,
      ).get()).toBeTruthy()

      const embeddingAttempts = sqlite.prepare(
        `SELECT sql FROM sqlite_schema
         WHERE type = 'table' AND name = 'embedding_attempts'`,
      ).get() as { sql: string } | undefined
      expect(embeddingAttempts?.sql).toContain('vector_succeeded_marker_failed')
      expect(embeddingAttempts?.sql).toContain('provider_failed')
      expect(embeddingAttempts?.sql).toContain('rejected')
      expect(embeddingAttempts?.sql).toContain('completed')
      expect(() => sqlite.exec(`
        INSERT INTO embedding_attempts (
          attempt_id, owner, repo, name, vector_id, content_sha, state,
          provider_stage, started_at, finished_at, error_code, error_message
        ) VALUES (
          'invalid-complete', 'acme', 'skills', 'one', 'vector', 'sha', 'completed',
          NULL, 1, NULL, NULL, NULL
        );
      `)).toThrow()
      expect(() => sqlite.exec(`
        INSERT INTO embedding_attempts (
          attempt_id, owner, repo, name, vector_id, content_sha, state,
          provider_stage, started_at, finished_at, error_code, error_message
        ) VALUES (
          'invalid-failure', 'acme', 'skills', 'one', 'vector', 'sha', 'provider_failed',
          'vectorize', 1, 2, NULL, NULL
        );
      `)).toThrow()
      expect(() => sqlite.exec(`
        INSERT INTO embedding_attempts (
          attempt_id, owner, repo, name, vector_id, content_sha, state,
          provider_stage, started_at, finished_at, error_code, error_message
        ) VALUES (
          'invalid-time', 'acme', 'skills', 'one', 'vector', 'sha', 'completed',
          NULL, 2, 1, NULL, NULL
        );
      `)).toThrow()

      const activityColumns = sqlite.prepare(`PRAGMA table_info(activity)`).all() as Array<{ name: string }>
      expect(activityColumns.map(column => column.name)).toContain('ingested_at')
      const digestRuns = sqlite.prepare(
        `SELECT sql FROM sqlite_schema
         WHERE type = 'table' AND name = 'digest_runs'`,
      ).get() as { sql: string } | undefined
      expect(digestRuns?.sql).toContain(`'claimed'`)
      expect(digestRuns?.sql).toContain(`'sending'`)
      expect(digestRuns?.sql).toContain(`'failed'`)
      expect(digestRuns?.sql).toContain(`'sent'`)
      expect(digestRuns?.sql).toContain(`'skipped'`)
      expect(digestRuns?.sql).toContain(`'uncertain'`)
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_digest_cursor'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name = 'weekly_skill_sends'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT cron, stale_after_seconds FROM sync_jobs WHERE name = 'send-digests'`,
      ).get()).toEqual({ cron: '0 9 1 * *', stale_after_seconds: 3_024_000 })
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'trigger' AND name = 'activity_require_ingested_at'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'trigger' AND name = 'activity_preserve_ingested_at'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_jobs_dispatchable'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_jobs_stale_reserved'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_failed_jobs_batch_failed_at'`,
      ).get()).toBeTruthy()
      const scheduledRuns = sqlite.prepare(
        `SELECT sql FROM sqlite_schema
         WHERE type = 'table' AND name = 'scheduled_runs'`,
      ).get() as { sql: string } | undefined
      expect(scheduledRuns?.sql).toContain(`'started'`)
      expect(scheduledRuns?.sql).toContain(`'succeeded'`)
      expect(scheduledRuns?.sql).toContain(`'failed'`)
      expect(scheduledRuns?.sql).toContain(`'expired'`)
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_scheduled_runs_task_latest'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name = 'github_sync_control'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name = 'registry_maintenance'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name = 'repo_sync_progress'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(`PRAGMA table_info(repos)`).all()
        .map(column => (column as { name: string }).name))
        .toEqual(expect.arrayContaining(['source_owner', 'source_repo', 'description']))
      expect(sqlite.prepare(`PRAGMA table_info(skill_repo_review_sync_outbox)`).all()
        .map(column => (column as { name: string }).name))
        .toContain('claim_discovery')
      expect((sqlite.prepare(`
        SELECT sql FROM sqlite_schema
        WHERE type = 'table' AND name = 'discovery_candidates'
      `).get() as { sql: string }).sql).toContain(`'skills_sh'`)
      expect(sqlite.prepare(`
        SELECT name FROM sqlite_schema
        WHERE type = 'table' AND name = 'skills_sh_crawl_runs'
      `).get()).toBeTruthy()
      expect(sqlite.prepare(`
        SELECT name FROM sqlite_schema
        WHERE type = 'table' AND name = 'skills_sh_discovery_observations'
      `).get()).toBeTruthy()
      expect(sqlite.prepare(`PRAGMA table_info(skills_sh_crawl_runs)`).all()
        .map(column => (column as { name: string }).name))
        .toContain('leaderboard_repos_seeded')
      expect(sqlite.prepare(`
        SELECT status, reviewed_by
        FROM skill_repo_eligibility
        WHERE owner = 'harlan-zw' AND repo = 'harlan-agent-kit'
      `).get()).toEqual({
        status: 'eligible',
        reviewed_by: 'harlan',
      })
      expect(sqlite.prepare(`
        SELECT source, outcome, retry_state
        FROM discovery_candidates
        WHERE owner = 'harlan-zw' AND repo = 'harlan-agent-kit'
      `).get()).toEqual({
        source: 'manual',
        outcome: 'pending',
        retry_state: 'ready',
      })
      // The lexical search lane can only match what is in the FTS index; if
      // `description` is missing, prose queries silently return nothing.
      expect(sqlite.prepare(`PRAGMA table_info(skills_fts)`).all()
        .map(column => (column as { name: string }).name))
        .toEqual(['name', 'owner', 'repo', 'display_name', 'slug', 'description'])
      const seededStarObservation = sqlite.prepare(`
        SELECT observed_day, stars
        FROM repo_star_observations
        WHERE owner = 'label-test' AND repo = 'skills'
      `).get() as { observed_day: number, stars: number }
      expect(seededStarObservation.stars).toBe(0)
      expect(seededStarObservation.observed_day % 86_400).toBe(0)
      // The ai-ready status counters read the whole table without this, because
      // the planner picks the near-useless `is_error` index for
      // `indexed = ? AND is_error = 0`. `ai_ready_pages` belongs to the
      // nuxt-ai-ready module, so `0065` creates it here for exactly this reason
      // and `0091` only adds to it; a fresh database must still get the index.
      expect(sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_ai_ready_pages_indexed_is_error'
      `).pluck().get()).toBe('idx_ai_ready_pages_indexed_is_error')
      // `querySkills` matches identities as `owner || '/' || repo || '/' || name`,
      // which no ordinary index can serve, so without this the batch lookup scans
      // the whole skills table on every call. SQLite only uses an expression index
      // when both sides match after normalisation, so the stored expression is
      // asserted verbatim: editing one side alone silently restores the scan.
      expect(sqlite.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_skills_identity_path'
      `).pluck().get()).toContain(`(owner || '/' || repo || '/' || name)`)
      // The indexnow counter reads 143k index entries whatever we do, because
      // SQLite cannot match a partial index whose WHERE contains an OR. Carrying
      // the two extra columns makes that scan covering, which is the difference
      // between 254ms and 13ms.
      expect(sqlite.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_ai_ready_pages_indexnow_scan'
      `).pluck().get()).toContain('indexnow_synced_at')
      // Likes are the single per-skill primitive (ADR-0003). The composite PK is
      // what makes a double-POST idempotent, and skills.like_count is what the
      // skill_dirty drain recomputes into.
      expect(sqlite.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'skill_likes'
      `).pluck().get()).toContain('PRIMARY KEY (user_id, owner, repo, name)')
      expect(sqlite.prepare(`SELECT COUNT(*) FROM pragma_table_info('skills') WHERE name = 'like_count'`)
        .pluck().get()).toBe(1)
      expect(sqlite.prepare(`SELECT COUNT(*) FROM pragma_table_info('repo_sync_progress') WHERE name = 'total_skills'`)
        .pluck().get()).toBe(1)
      // Trending discovery. `x_posts` is repo-grained via `x_post_repos`
      // because a post links a repository, not an individual skill, and the
      // partial index is what lets the refresh task claim due work without
      // scanning the frozen majority it will never read again.
      expect(sqlite.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_x_posts_refresh'
      `).pluck().get()).toContain('refresh_tier != \'frozen\'')
      // One ledger for every discovery source, so review is a single list.
      expect(sqlite.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'discovery_ledger'
      `).pluck().get()).toContain('UNIQUE (source, owner, repo)')
      // Star surges reference repos, so the FK only holds if repos still
      // carries its composite key by the time this migration lands.
      expect(sqlite.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'repo_star_surges'
      `).pluck().get()).toContain('REFERENCES repos(owner, repo)')
      // Replaces an assertion that pinned the newest migration by name. It
      // failed on every new migration and taught nothing about the chain.
      //
      // The ledger's terminal vocabulary survives the rebuilds. `gone` is what
      // keeps a deleted repository out of the reviewer's queue, and it only
      // works if the rebuilt CHECK admits it.
      expect(() => sqlite.exec(`
        INSERT INTO discovery_ledger (source, owner, repo, evidence_url, evidence_text,
          first_seen_at, last_seen_at, status)
        VALUES ('x', 'o', 'gone-repo', 'https://x.com/a/status/1', 'e', 1, 1, 'gone')
      `)).not.toThrow()
      expect(() => sqlite.exec(`
        INSERT INTO discovery_ledger (source, owner, repo, evidence_url, evidence_text,
          first_seen_at, last_seen_at, status)
        VALUES ('x', 'o', 'bad-repo', 'https://x.com/a/status/1', 'e', 1, 1, 'invented')
      `)).toThrow()
    }
    finally {
      sqlite.close()
    }
  })

  // Turning the old per-person cadence to Off never touched `email_opt_in`,
  // so those rows still read opted in. The monthly cron sends to every
  // opted-in user, and 0117 must carry the Off choice over as a real opt-out.
  it('repairs cadence-off users to opted out before the monthly cron inherits them', async () => {
    const before = createSqliteD1(allMigrationNames().map(file => `migrations/${file}`).filter(file => file < 'migrations/0117_email_cadence_split.sql'))
    try {
      before.raw.exec(`
        INSERT INTO users (
          github_id, login, email_opt_in, digest_frequency, digest_email,
          onboarded_at, created_at, last_login_at
        ) VALUES
          (1, 'turned-off', 1, 'off', 'off@example.com', 1, 1, 1),
          (2, 'still-weekly', 1, 'weekly', 'weekly@example.com', 1, 1, 1);
      `)

      before.raw.exec(readFileSync(resolve(process.cwd(), 'migrations/0117_email_cadence_split.sql'), 'utf8'))

      expect(before.raw.prepare(
        `SELECT login, email_opt_in FROM users WHERE login IN ('turned-off', 'still-weekly') ORDER BY id`,
      ).all()).toEqual([
        { login: 'turned-off', email_opt_in: 0 },
        { login: 'still-weekly', email_opt_in: 1 },
      ])
      const eligible = await loadDigestEligibleUsers(before.db)
      expect(eligible.map(user => user.login)).toEqual(['still-weekly'])
    }
    finally {
      before.close()
    }
  })

  // The weekly lane lost its `email_opt_in` guard, so it reads only
  // `weekly_opt_out`. A cadence-off user carried `email_opt_in = 1` out of the
  // old digest settings, and 0117 must move that Off choice onto
  // `weekly_opt_out` too, or the weekly cron silently resubscribes them.
  it('keeps cadence-off users out of the weekly lane after the digest split', async () => {
    const before = createSqliteD1(allMigrationNames().map(file => `migrations/${file}`).filter(file => file < 'migrations/0117_email_cadence_split.sql'))
    try {
      before.raw.exec(`
        INSERT INTO users (
          github_id, login, email_opt_in, digest_frequency, digest_email,
          weekly_opt_out, onboarded_at, created_at, last_login_at
        ) VALUES
          (1, 'cadence-off', 1, 'off', 'off@example.com', 0, 1, 1, 1),
          (2, 'weekly-reader', 1, 'weekly', 'weekly@example.com', 0, 1, 1, 1);
      `)

      before.raw.exec(readFileSync(resolve(process.cwd(), 'migrations/0117_email_cadence_split.sql'), 'utf8'))

      const weekly = await loadWeeklyRecipients(before.db)
      expect(weekly.map(user => user.login)).toEqual(['weekly-reader'])
    }
    finally {
      before.close()
    }
  })

  it('upgrades an existing database without backfilling historical repos', () => {
    const sqlite = new Database(':memory:')
    const migrationsDir = resolve(process.cwd(), 'migrations')
    const migrations = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort()

    try {
      for (const migration of migrations.filter(file => file < '0070_discovery_candidates.sql'))
        sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))

      sqlite.prepare(
        `INSERT INTO repos (owner, repo, repo_skill_count)
         VALUES ('historical', 'candidate', 1)`,
      ).run()
      sqlite.exec(readFileSync(resolve(migrationsDir, '0070_discovery_candidates.sql'), 'utf8'))
      sqlite.exec(readFileSync(resolve(migrationsDir, '0071_embedding_attempts.sql'), 'utf8'))
      sqlite.exec(`
        INSERT INTO discovery_candidates (
          owner, repo, source, first_discovered_at, last_discovered_at,
          last_attempted_at, attempt_count, outcome, rejection_reason, last_error,
          retry_state, next_retry_at, owner_verified, reconsideration_count,
          claimed_at, claim_token
        ) VALUES (
          'historical', 'candidate', 'github_search', 10, 20,
          21, 3, 'pending', NULL, NULL,
          'claimed', NULL, 1, 2,
          22, 'claim-token'
        );
      `)

      sqlite.exec(`
        INSERT INTO users (
          github_id, login, email_opt_in, digest_frequency, digest_hour,
          timezone, onboarded_at, created_at, last_login_at
        ) VALUES (
          1, 'legacy-digest-user', 1, 'weekly', 9,
          'UTC', 1, 1, 1
        );
        INSERT INTO activity (type, owner, repo, name, occurred_at, sha)
        VALUES ('skill_updated', 'historical', 'candidate', 'one', 5, 'sha');
        INSERT INTO digest_runs (
          user_id, window_start, window_end, change_count, status,
          resend_id, ai_summary_used, sent_at, error
        ) VALUES (
          1, 0, 10, 1, 'queued',
          NULL, 0, NULL, NULL
        );
      `)
      sqlite.exec(readFileSync(resolve(migrationsDir, '0072_digest_delivery.sql'), 'utf8'))
      sqlite.exec(readFileSync(resolve(migrationsDir, '0073_repair_schema_drift.sql'), 'utf8'))
      for (const migration of migrations.filter(file =>
        file >= '0074_scheduled_run_history.sql'
        && file <= '0079_discovery_historical_source.sql')) {
        sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))
      }

      expect(sqlite.prepare(`SELECT * FROM discovery_candidates`).get()).toMatchObject({
        owner: 'historical',
        repo: 'candidate',
        source: 'github_search',
        first_discovered_at: 10,
        last_discovered_at: 20,
        last_attempted_at: 21,
        attempt_count: 3,
        outcome: 'pending',
        rejection_reason: null,
        last_error: null,
        retry_state: 'claimed',
        next_retry_at: null,
        owner_verified: 1,
        reconsideration_count: 2,
        claimed_at: 22,
        claim_token: 'claim-token',
      })
      expect(sqlite.prepare(`SELECT count(*) FROM repos`).pluck().get()).toBe(1)
      expect(sqlite.prepare(`SELECT source_owner, source_repo FROM repos`).get()).toEqual({
        source_owner: null,
        source_repo: null,
      })
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_discovery_candidates_due'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT count(*) FROM embedding_attempts`).pluck().get()).toBe(0)
      expect(sqlite.prepare(
        `SELECT status, cursor_start, cursor_end, error_code
         FROM digest_runs`,
      ).get()).toEqual({
        status: 'failed',
        cursor_start: 0,
        cursor_end: 1,
        error_code: 'legacy_queued',
      })
      expect(sqlite.prepare(`SELECT ingested_at FROM activity`).pluck().get()).toBe(5)
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'index' AND name = 'idx_jobs_dispatchable'`,
      ).get()).toBeTruthy()
    }
    finally {
      sqlite.close()
    }
  })
})
