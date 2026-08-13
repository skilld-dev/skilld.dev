import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  buildSkillsShImportSql,
  crawlSkillsSh,
  parseSkillsShCrawlArgs,
  parseSkillsShLeaderboardHtml,
  summarizeSkillsShEntries,
} from '../../scripts/lib/skills-sh-crawler'

const fixture = readFileSync(
  resolve(process.cwd(), 'test/fixtures/skills-sh/leaderboard.html'),
  'utf8',
)

describe('skills.sh crawler', () => {
  it('parses ranked GitHub skills and excludes well-known sources', () => {
    const parsed = parseSkillsShLeaderboardHtml(fixture, 'trending', 1_000, 500)

    expect(parsed).toEqual({
      _tag: 'ok',
      ignoredWellKnown: 1,
      entries: [
        {
          view: 'trending',
          owner: 'acme',
          repo: 'agent-skills',
          skill: 'research',
          rank: 1,
          sourceUrl: 'https://www.skills.sh/acme/agent-skills/research',
          observedAt: 1_000,
        },
        {
          view: 'trending',
          owner: 'acme',
          repo: 'agent-skills',
          skill: 'review',
          rank: 2,
          sourceUrl: 'https://www.skills.sh/acme/agent-skills/review',
          observedAt: 1_000,
        },
        {
          view: 'trending',
          owner: 'beta',
          repo: 'skills',
          skill: 'frontend-design',
          rank: 3,
          sourceUrl: 'https://www.skills.sh/beta/skills/frontend-design',
          observedAt: 1_000,
        },
      ],
    })
  })

  it('fails loudly when the leaderboard shape drifts', () => {
    expect(parseSkillsShLeaderboardHtml(
      '<a class="group grid" href="/acme/skills/test"><h3>test</h3></a>',
      'all-time',
      1_000,
      500,
    )).toEqual({
      _tag: 'error',
      reason: 'malformed_skill_rows',
      malformedRows: 1,
    })

    expect(parseSkillsShLeaderboardHtml('<html></html>', 'all-time', 1_000, 500))
      .toEqual({ _tag: 'error', reason: 'no_skill_rows', malformedRows: 0 })
  })

  it('surfaces upstream HTTP failures as values', async () => {
    const result = await crawlSkillsSh(
      { limit: 10, views: ['trending'] },
      1_000,
      { fetch: async () => new Response('unavailable', { status: 503 }) },
    )

    expect(result).toEqual({
      _tag: 'error',
      view: 'trending',
      reason: 'unexpected_status',
      detail: 'HTTP 503',
    })
  })

  it('limits each view before producing repository hints', () => {
    const parsed = parseSkillsShLeaderboardHtml(fixture, 'trending', 1_000, 2)
    if (parsed._tag === 'error')
      throw new Error(parsed.reason)

    expect(summarizeSkillsShEntries(parsed.entries)).toEqual({
      skillsObserved: 2,
      reposObserved: 1,
      views: ['trending'],
    })
  })

  it('builds replay-safe SQL without reviving exhausted candidates', () => {
    const parsed = parseSkillsShLeaderboardHtml(fixture, 'trending', 1_000, 500)
    if (parsed._tag === 'error')
      throw new Error(parsed.reason)

    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE discovery_candidates (
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN (
            'owned_scan', 'github_search', 'historical_inventory', 'manual', 'skills_sh'
          )),
          first_discovered_at INTEGER NOT NULL,
          last_discovered_at INTEGER NOT NULL,
          last_attempted_at INTEGER,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          outcome TEXT NOT NULL DEFAULT 'pending',
          rejection_reason TEXT,
          last_error TEXT,
          retry_state TEXT NOT NULL DEFAULT 'ready',
          next_retry_at INTEGER,
          owner_verified INTEGER NOT NULL DEFAULT 0,
          reconsideration_count INTEGER NOT NULL DEFAULT 0,
          claimed_at INTEGER,
          claim_token TEXT,
          PRIMARY KEY (owner, repo)
        );
        CREATE TABLE skills_sh_crawl_runs (
          run_id TEXT PRIMARY KEY,
          crawled_at INTEGER NOT NULL,
          completed_at INTEGER,
          status TEXT NOT NULL,
          views TEXT NOT NULL,
          skills_observed INTEGER NOT NULL,
          repos_observed INTEGER NOT NULL,
          ignored_well_known INTEGER NOT NULL,
          leaderboard_repos_seeded INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE skills_sh_discovery_observations (
          run_id TEXT NOT NULL,
          view TEXT NOT NULL,
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          skill TEXT NOT NULL,
          rank INTEGER NOT NULL,
          installs_label TEXT NOT NULL,
          installs_estimate INTEGER NOT NULL,
          source_url TEXT NOT NULL,
          observed_at INTEGER NOT NULL,
          PRIMARY KEY (run_id, view, owner, repo, skill)
        );
        INSERT INTO discovery_candidates (
          owner, repo, source, first_discovered_at, last_discovered_at,
          last_attempted_at, attempt_count, outcome, rejection_reason, retry_state
        ) VALUES (
          'acme', 'agent-skills', 'github_search', 10, 20,
          21, 5, 'rejected', 'trust_inputs_insufficient', 'exhausted'
        );
      `)

      const sql = buildSkillsShImportSql({
        runId: 'run-1',
        crawledAt: 1_000,
        entries: parsed.entries,
      })
      sqlite.exec(sql)
      sqlite.exec(sql)

      expect(sql).not.toContain('22.6K')
      expect(sql).not.toContain('22_600')
      expect(sql).not.toContain('skill_repo_eligibility')

      expect(sqlite.prepare(`
        SELECT source, first_discovered_at, last_discovered_at, attempt_count,
               outcome, rejection_reason, retry_state
        FROM discovery_candidates
        WHERE owner = 'acme' AND repo = 'agent-skills'
      `).get()).toEqual({
        source: 'skills_sh',
        first_discovered_at: 10,
        last_discovered_at: 1_000,
        attempt_count: 5,
        outcome: 'rejected',
        rejection_reason: 'trust_inputs_insufficient',
        retry_state: 'exhausted',
      })
      expect(sqlite.prepare(`
        SELECT owner, repo, source, outcome, retry_state
        FROM discovery_candidates
        WHERE owner = 'beta' AND repo = 'skills'
      `).get()).toEqual({
        owner: 'beta',
        repo: 'skills',
        source: 'skills_sh',
        outcome: 'pending',
        retry_state: 'ready',
      })
      expect(sqlite.prepare(`SELECT COUNT(*) FROM skills_sh_crawl_runs`).pluck().get()).toBe(1)
      expect(sqlite.prepare(`SELECT COUNT(*) FROM skills_sh_discovery_observations`).pluck().get()).toBe(3)
    }
    finally {
      sqlite.close()
    }
  })

  it('parses safe dry-run and explicit apply targets', () => {
    expect(parseSkillsShCrawlArgs([])).toEqual({
      _tag: 'ok',
      options: {
        apply: null,
        emitSql: false,
        limit: 500,
        views: ['trending', 'all-time'],
      },
    })
    expect(parseSkillsShCrawlArgs([
      '--apply=remote',
      '--view=trending',
      '--limit=25',
    ]))
      .toEqual({
        _tag: 'ok',
        options: {
          apply: 'remote',
          emitSql: false,
          limit: 25,
          views: ['trending'],
        },
      })
    expect(parseSkillsShCrawlArgs(['--apply=remote', '--emit-sql'])).toEqual({
      _tag: 'error',
      reason: 'apply_and_emit_sql_conflict',
    })
    expect(parseSkillsShCrawlArgs(['--limit=0'])).toEqual({
      _tag: 'error',
      reason: 'invalid_limit',
    })
  })
})
