// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runExternalChecks } from '@harlan-zw/nuxt-checkin/external'
import { afterEach, expect, it, vi } from 'vitest'
import analyticsCheck from '../../checks/external/analytics'
import ciCheck from '../../checks/external/ci'
import databaseCheck from '../../checks/external/database'
import deployCheck from '../../checks/external/deploy'
import gitCheck from '../../checks/external/git'
import workersCheck from '../../checks/external/workers'

const boundary = vi.hoisted(() => ({ command: vi.fn() }))
vi.mock('@harlan-zw/nuxt-checkin/external', async (original) => {
  const actual = await original<typeof import('@harlan-zw/nuxt-checkin/external')>()
  return { ...actual, runCheckCommand: boundary.command }
})
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true })))
  boundary.command.mockReset()
  vi.unstubAllGlobals()
})

it('shares deployment and database evidence without blocking nested collectors', async () => {
  const now = new Date('2026-09-14T00:00:00Z')
  const root = await mkdtemp(join(tmpdir(), 'skilld-checkin-'))
  roots.push(root)
  await mkdir(join(root, 'shared/server'), { recursive: true })
  await mkdir(join(root, 'migrations'))
  await writeFile(join(root, 'shared/server/x-ingest.ts'), 'export const DAILY_DISCOVERY_READ_BUDGET = 400')
  await writeFile(join(root, 'migrations/001.sql'), '')
  boundary.command.mockImplementation(async (_context, command: string, args: string[]) => {
    let output: unknown = ''
    if (command === 'git') {
      output = args[0] === 'ls-tree' ? 'migrations/001.sql' : args[0] === 'branch' ? 'main' : args[0] === 'rev-parse' ? 'abc' : ''
      return { _tag: 'Ok', stdout: output, stderr: '' }
    }
    if (args[0] === 'deployments') {
      output = [{ id: 'deployment', created_on: now.toISOString(), versions: [{ percentage: 100, version_id: 'release-1' }] }]
    }
    else {
      const sql = args[args.indexOf('--command') + 1]!
      let rows: unknown[] = []
      if (sql.includes('sqlite_master'))
        rows = ['skills', 'repos', 'owners', 'users', 'activity', 'install_events', 'sync_jobs', 'jobs', 'failed_jobs', 'daily_health_checks', 'd1_migrations'].map(name => ({ name }))
      else if (sql.includes('MAX(name)'))
        rows = [{ name: '001.sql' }]
      else if (sql.includes('summary_json'))
        rows = [{ report_date: '2026-09-14', delivery_status: 'sent', summary_json: JSON.stringify({ window: {}, reasons: [], warnings: [], checkin: health }) }]
      else if (sql.includes('AS skills'))
        rows = [{ skills: 23, broken_repos: 99 }]
      else if (sql.includes('AS new_skills'))
        rows = [{ new_skills: 2, digests_failed: 0 }]
      else if (sql.includes('AS newly_broken_repos_total'))
        rows = [{ newly_broken_repos_total: 0, stale_reserved_jobs: 0 }]
      else if (sql.includes('AS ai_cost_usd'))
        rows = [{ x_discovery_reads_today: 10, x_hot_posts: 0 }]
      output = [{ success: true, results: rows }]
    }
    return { _tag: 'Ok', stdout: JSON.stringify(output), stderr: '' }
  })
  const checks = [gitCheck, deployCheck, databaseCheck]
  const result = await runExternalChecks(checks, { required: checks.map(check => check.id), timeoutMs: 1000, totalTimeoutMs: 1500 }, { rootDir: root, env: {}, clock: () => now })
  expect(result.report).toMatchObject({ severity: 'pass', coverage: 'complete' })
  expect(result.report.results.find(check => check.id === 'skilld.database')?.result).toMatchObject({ evidence: { inventory: { skills: 23 } } })
  expect(boundary.command.mock.calls.filter(([, command, args]) => command === 'git' && args[0] === 'fetch')).toHaveLength(1)
  expect(boundary.command.mock.calls.filter(([, , args]) => args.includes('SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name'))).toHaveLength(1)
})

it('rejects oversized Worker analytics evidence', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } }, padding: 'x'.repeat(2_097_153) })))
  const { report } = await runExternalChecks([workersCheck], { required: [workersCheck.id] }, { env: { CLOUDFLARE_USAGE_TOKEN: 'test-token' } })
  expect(report.coverage).toBe('incomplete')
  expect(report.results[0]?.result._tag).toBe('Unavailable')
})

// The published runOne archives every thrown error as the generic
// 'Check threw an exception.' and the CLI passes no onError callback, so the
// 2026-09-29 run's five Cloudflare failures reached the archive with no cause.
it('archives the collector failure cause instead of the generic throw message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Cloudflare API is unreachable.')))
  const { report } = await runExternalChecks([workersCheck], { required: [workersCheck.id] }, { env: { CLOUDFLARE_USAGE_TOKEN: 'test-token' } })
  expect(report.results[0]?.result).toEqual({ _tag: 'Unavailable', reason: 'Cloudflare API is unreachable.' })
})

// The ranked top page caps at 50 groups, so totals summed from that page
// silently undercount once a day holds more groups than the cap. The totals
// must come from their own untruncated rollup.
it('totals command copies from an untruncated rollup, not the capped top page', async () => {
  const topRows = Array.from({ length: 50 }, (_, index) => ({ mode: 'run', kind: 'skill', slug: `owner/skill-${index}`, copies: 1 }))
  const totalsRows = [{ mode: 'run', copies: 50 }, { mode: 'install', copies: 10 }]
  vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init?: { body?: string }) => {
    return Response.json({ data: init?.body?.includes('LIMIT 50') ? topRows : totalsRows })
  }))

  const { report } = await runExternalChecks([analyticsCheck], { required: [analyticsCheck.id] }, { env: { CLOUDFLARE_USAGE_TOKEN: 'test-token' } })

  expect(report.results.find(check => check.id === 'skilld.analytics')?.result).toMatchObject({
    _tag: 'Pass',
    evidence: { commandCopies: { total: 60, run: 50, install: 10 } },
  })
})

it('reads production CI verdicts from main only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skilld-checkin-ci-'))
  roots.push(root)
  await mkdir(join(root, '.github/workflows'), { recursive: true })
  await writeFile(join(root, '.github/workflows/test.yml'), 'name: Test')
  boundary.command.mockResolvedValue({ _tag: 'Ok', stdout: '[]', stderr: '' })
  await runExternalChecks([ciCheck], { required: [ciCheck.id] }, { rootDir: root, env: {} })
  expect(boundary.command.mock.calls.length).toBeGreaterThan(0)
  for (const [, command, args] of boundary.command.mock.calls) {
    expect(command).toBe('gh')
    expect(args[args.indexOf('--branch') + 1]).toBe('main')
  }
})

// GitHub's per-workflow `gh run list` intermittently serves a day-stale
// snapshot: on 2026-09-30 the archive read the Deploy gate success while the
// live gate had failed at 16:55Z on run 36747725607, and the same command
// reproduced rows from three different days. The unscoped recent feed answers
// from separate evidence, so a verdict-carrying run it shows that the
// per-workflow page lacks must decide the gate, not the stale page.
it('does not archive a stale per-workflow page as a passing gate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skilld-checkin-ci-stale-'))
  roots.push(root)
  await mkdir(join(root, '.github/workflows'), { recursive: true })
  await writeFile(join(root, '.github/workflows/deploy.yml'), 'name: Deploy to Cloudflare')

  const staleSuccess = {
    workflowName: 'Deploy to Cloudflare',
    status: 'completed',
    conclusion: 'success',
    databaseId: 36740000000,
    displayTitle: 'chore: bump',
    headSha: 'abc123',
    createdAt: '2026-09-30T02:00:00Z',
    updatedAt: '2026-09-30T02:20:00Z',
    url: 'https://example.com/runs/36740000000',
  }
  const failedRun = {
    workflowName: 'Deploy to Cloudflare',
    status: 'completed',
    conclusion: 'failure',
    databaseId: 36747725607,
    displayTitle: 'chore: bump',
    headSha: 'def456',
    createdAt: '2026-09-30T16:55:00Z',
    updatedAt: '2026-09-30T17:15:00Z',
    url: 'https://example.com/runs/36747725607',
  }
  boundary.command.mockImplementation(async (_context, command: string, args: string[]) => {
    if (command !== 'gh')
      throw new Error(`unexpected command: ${command}`)
    const rows = args.includes('--workflow') ? [staleSuccess] : [failedRun]
    return { _tag: 'Ok', stdout: JSON.stringify(rows), stderr: '' }
  })

  const { report } = await runExternalChecks([ciCheck], { required: [ciCheck.id] }, { rootDir: root, env: {} })

  expect(report.results.find(check => check.id === 'skilld.ci')?.result).toMatchObject({
    _tag: 'Fail',
    evidence: {
      workflows: [{
        name: 'Deploy to Cloudflare',
        latestRun: { databaseId: 36747725607 },
        state: { _tag: 'failure', consecutiveFailures: 1 },
      }],
    },
  })
})

// A page of cancelled queue-mates satisfied the collector's old `conclusion !==
// 'skipped'` re-fetch predicate, so the deeper 100-run page was never paid for
// and a verdict ten runs deep read as an observability gap.
it('pages past a full head sample of cancelled runs to the verdict it hid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skilld-checkin-ci-cancelled-'))
  roots.push(root)
  await mkdir(join(root, '.github/workflows'), { recursive: true })
  await writeFile(join(root, '.github/workflows/deploy.yml'), 'name: Deploy to Cloudflare')

  const cancelled = Array.from({ length: 10 }, (_, index) => ({
    workflowName: 'Deploy to Cloudflare',
    status: 'completed',
    conclusion: 'cancelled',
    databaseId: 20 - index,
    displayTitle: 'chore: bump',
    headSha: 'abc123',
    createdAt: `2026-09-21T02:${String(index).padStart(2, '0')}:00Z`,
    updatedAt: `2026-09-21T02:${String(index).padStart(2, '0')}:30Z`,
    url: `https://example.com/runs/${20 - index}`,
  }))
  const success = { ...cancelled[0]!, conclusion: 'success', databaseId: 10, createdAt: '2026-09-20T02:00:00Z' }
  boundary.command.mockImplementation(async (_context, command: string, args: string[]) => {
    if (command !== 'gh')
      throw new Error(`unexpected command: ${command}`)
    const rows = args.includes('--workflow') && args[args.indexOf('--limit') + 1] === '10' ? cancelled : [...cancelled, success]
    return { _tag: 'Ok', stdout: JSON.stringify(rows), stderr: '' }
  })

  const { report } = await runExternalChecks([ciCheck], { required: [ciCheck.id] }, { rootDir: root, env: {} })

  const requestedLimits = boundary.command.mock.calls
    .filter(([, , args]) => args.includes('--workflow'))
    .map(([, , args]) => args[args.indexOf('--limit') + 1])
  expect(requestedLimits).toEqual(['10', '100'])
  expect(report.results.find(check => check.id === 'skilld.ci')?.result).toMatchObject({
    _tag: 'Pass',
    evidence: { workflows: [{ name: 'Deploy to Cloudflare', state: { _tag: 'success' } }] },
  })
})
