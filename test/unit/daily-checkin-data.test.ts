import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runExternalChecks } from '@harlan-zw/nuxt-checkin/external'
import { afterEach, expect, it, vi } from 'vitest'
import baselineCheck from '../../checks/external/baseline'
import databaseCheck from '../../checks/external/database'

const boundary = vi.hoisted(() => ({ command: vi.fn() }))
vi.mock('@harlan-zw/nuxt-checkin/external', async (original) => {
  const actual = await original<typeof import('@harlan-zw/nuxt-checkin/external')>()
  return { ...actual, runCheckCommand: boundary.command }
})
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true })))
  boundary.command.mockReset()
})

const now = new Date('2026-09-14T00:00:00Z')
it('records a stale window without blocking a successful replacement baseline', async () => {
  const { report } = await runExternalChecks([baselineCheck], { required: [baselineCheck.id] }, { now, since: new Date(now.getTime() - 48 * 3_600_000), env: {} })
  expect(report).toMatchObject({ severity: 'pass', coverage: 'complete', results: [{ result: { evidence: { _tag: 'stale', gapHours: 48 } } }] })
})
it('marks an invalid comparison window as missing evidence', async () => {
  const { report } = await runExternalChecks([baselineCheck], { required: [baselineCheck.id] }, { now, since: new Date('invalid'), env: {} })
  expect(report.coverage).toBe('incomplete')
  expect(report.results[0]?.result).toMatchObject({ _tag: 'Warn', coverage: 'incomplete', evidence: { _tag: 'invalid' } })
})

// Issue #285: the gate read `skill_sync_failures` as a bare count, so a RED
// night named no Skills and triage needed a hand-run D1 query two days running.
it('archives the identities behind the skill sync failure count', async () => {
  const since = new Date(now.getTime() - 24 * 3_600_000)
  const root = await mkdtemp(join(tmpdir(), 'skilld-checkin-sync-'))
  roots.push(root)
  await mkdir(join(root, 'shared/server'), { recursive: true })
  await mkdir(join(root, 'migrations'))
  await writeFile(join(root, 'shared/server/x-ingest.ts'), 'export const DAILY_DISCOVERY_READ_BUDGET = 400\nconst MIN_SEARCH_PAGE_SIZE = 10')
  await writeFile(join(root, 'migrations/001.sql'), '')
  const skills = [
    { owner: 'anthu', repo: 'vite', name: 'env', sync_status: 'error', last_synced_at: Math.floor(since.getTime() / 1000) + 3600 },
    { owner: 'obra', repo: 'superpowers', name: 'tdd', sync_status: 'path_missing', last_synced_at: Math.floor(since.getTime() / 1000) + 7200 },
    { owner: 'harlan-zw', repo: 'skills', name: 'healthy', sync_status: 'ok', last_synced_at: Math.floor(since.getTime() / 1000) + 3600 },
    { owner: 'stale', repo: 'old', name: 'old-failure', sync_status: 'error', last_synced_at: Math.floor(since.getTime() / 1000) - 1 },
    { owner: 'fresh', repo: 'never-synced', name: 'no-status', sync_status: null, last_synced_at: Math.floor(since.getTime() / 1000) + 3600 },
  ]
  const failed = (sql: string) => {
    const bound = Number(sql.match(/last_synced_at >= (\d+)/)![1])
    return skills.filter(row => row.sync_status !== null && row.sync_status !== 'ok' && row.last_synced_at >= bound)
  }
  boundary.command.mockImplementation(async (_context, command: string, args: string[]) => {
    let output: unknown = ''
    if (command === 'git') {
      output = args[0] === 'ls-tree' ? 'migrations/001.sql' : args[0] === 'branch' ? 'main' : args[0] === 'rev-parse' ? 'abc' : ''
      return { _tag: 'Ok', stdout: output, stderr: '' }
    }
    const sql = args[args.indexOf('--command') + 1]!
    let rows: unknown[] = []
    if (sql.includes('sqlite_master'))
      rows = ['skills', 'repos', 'owners', 'users', 'activity', 'sync_jobs', 'jobs', 'failed_jobs', 'd1_migrations'].map(name => ({ name }))
    else if (sql.includes('SELECT owner, repo, name FROM skills'))
      rows = failed(sql).sort((a, b) => b.last_synced_at - a.last_synced_at).map(({ owner, repo, name }) => ({ owner, repo, name }))
    else if (sql.includes('MAX(name)'))
      rows = [{ name: '001.sql' }]
    else if (sql.includes('AS skills'))
      rows = [{ skills: skills.length, broken_repos: 0 }]
    else if (sql.includes('AS new_skills'))
      rows = [{ new_skills: 0, digests_failed: 0 }]
    else if (sql.includes('AS newly_broken_repos_total'))
      rows = [{ newly_broken_repos_total: 0, stale_reserved_jobs: 0, skill_sync_failures: failed(sql).length, failed_jobs: 0 }]
    else if (sql.includes('AS ai_cost_usd'))
      rows = [{ x_discovery_reads_today: 10, x_hot_posts: 0 }]
    output = [{ success: true, results: rows }]
    return { _tag: 'Ok', stdout: JSON.stringify(output), stderr: '' }
  })
  const { report } = await runExternalChecks([databaseCheck], { required: [databaseCheck.id] }, { rootDir: root, env: {}, now, since })
  expect(report.coverage).toBe('complete')
  expect(report.results.find(check => check.id === 'skilld.database')?.result).toMatchObject({
    _tag: 'Warn',
    evidence: {
      pipeline: {
        skill_sync_failures: 2,
        skill_sync_failure_identities: [
          { owner: 'obra', repo: 'superpowers', name: 'tdd' },
          { owner: 'anthu', repo: 'vite', name: 'env' },
        ],
      },
    },
  })
})
