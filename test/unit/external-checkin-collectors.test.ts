// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineCheck, pass, runChecks, runExternalChecks } from '@harlan-zw/nuxt-checkin/external'
import { afterEach, expect, it, vi } from 'vitest'
import ciCheck from '../../checks/external/ci'
import databaseCheck from '../../checks/external/database'
import deployCheck from '../../checks/external/deploy'
import gitCheck from '../../checks/external/git'
import healthCheck from '../../checks/external/health-email'
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
  const health = await runChecks(['skilld.daily-health', 'skilld.daily-health-coverage'].map(id => defineCheck({ id, run: () => pass() })), { now, identity: { site: 'skilld.dev', environment: 'production', deployment: 'release-1' } })
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
  const checks = [gitCheck, deployCheck, databaseCheck, healthCheck]
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
