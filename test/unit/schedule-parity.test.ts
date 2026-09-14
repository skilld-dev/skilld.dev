import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  calculateScheduleParity,
  loadCloudflareSchedules,
  parseCloudflareSchedulesResponse,
  parseScheduleParityArgs,
} from '../../scripts/lib/schedule-parity'
import {
  discoverScheduledTasks,
  parseGeneratedCrons,
  parseScheduledTasksDocument,
} from '../../scripts/lib/scheduled-task-source'
import { INFRASTRUCTURE_CRONS, SCHEDULE_POLICY } from '../../shared/schedule-policy'

describe('scheduled task coverage and parity', () => {
  it('fails loudly when a discovered scheduled task is not static and parseable', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'skilld-schedule-parity-'))
    const taskDirectory = resolve(projectRoot, 'server/tasks/nested')
    const sourcePath = resolve(taskDirectory, 'dynamic.ts')
    try {
      mkdirSync(taskDirectory, { recursive: true })
      writeFileSync(sourcePath, `
        const CRON = '0 * * * *'
        export default defineScheduledTask({
          cron: CRON,
          name: 'dynamic-task',
          async run() {},
        })
      `)

      expect(() => discoverScheduledTasks(projectRoot))
        .toThrow(`Unable to parse exactly one static scheduled task name and cron in ${sourcePath}`)
    }
    finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('observes every scheduled task with no exemptions', () => {
    const tasks = discoverScheduledTasks(process.cwd())
    expect(tasks.some(task => task.name === 'daily-health-check')).toBe(false)
    expect(SCHEDULE_POLICY.filter(entry => entry._tag === 'exempt')).toEqual([])
    expect(SCHEDULE_POLICY.map(entry => entry.taskName).sort())
      .toEqual(tasks.map(task => task.name).sort())
    for (const task of tasks)
      expect(readFileSync(task.sourcePath, 'utf8')).toContain('runObservedScheduledTask')
  })

  it('discovers the app-owned AI-ready cron as a static, observed task', () => {
    const task = discoverScheduledTasks(process.cwd())
      .find(candidate => candidate.name === 'ai-ready:cron')

    expect(task).toMatchObject({ name: 'ai-ready:cron', cron: '*/5 * * * *' })
  })

  it('aligns local definitions, policy, generated triggers, and docs', () => {
    const tasks = discoverScheduledTasks(process.cwd())
    const generated = parseGeneratedCrons(readFileSync(resolve(process.cwd(), '.nuxt/cf-jobs/crons.suggested.toml'), 'utf8'))
    const documented = parseScheduledTasksDocument(readFileSync(resolve(process.cwd(), 'CRON.md'), 'utf8'))
    const expectedCrons = [...new Set([...tasks.map(task => task.cron), ...INFRASTRUCTURE_CRONS])].sort()

    expect(generated.sort()).toEqual(expectedCrons)
    expect(documented).toEqual(tasks)
    expect(SCHEDULE_POLICY.filter(entry => entry._tag === 'observed').map(entry => ({
      name: entry.taskName,
      cron: entry.cron,
    })).sort((a, b) => a.name.localeCompare(b.name))).toEqual(tasks.map(task => ({
      name: task.name,
      cron: task.cron,
    })))
  })

  it('parses Cloudflare schedules and reports exact drift', () => {
    const response = parseCloudflareSchedulesResponse(200, {
      success: true,
      result: { schedules: [{ cron: '0 * * * *' }, { cron: '30 * * * *' }] },
    })
    expect(response).toEqual({
      _tag: 'available',
      crons: ['0 * * * *', '30 * * * *'],
    })
    expect(calculateScheduleParity(
      ['0 * * * *', '15 * * * *'],
      ['0 * * * *', '30 * * * *'],
    )).toEqual({
      _tag: 'drift',
      expected: ['0 * * * *', '15 * * * *'],
      deployed: ['0 * * * *', '30 * * * *'],
      missing: ['15 * * * *'],
      extra: ['30 * * * *'],
    })
  })

  it('makes Cloudflare authentication failures explicit', () => {
    expect(parseCloudflareSchedulesResponse(403, { success: false, errors: [{ message: 'forbidden' }] }))
      .toMatchObject({ _tag: 'unavailable', reason: 'authorization', status: 403 })
    expect(parseCloudflareSchedulesResponse(200, {
      success: true,
      result: [{ cron: '0 * * * *' }],
    })).toMatchObject({ _tag: 'unavailable', reason: 'parse' })
  })

  it('uses only GET and tags network failures', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, result: { schedules: [] } }),
    })
    await expect(loadCloudflareSchedules({
      accountId: 'account',
      scriptName: 'worker',
      token: 'token',
      fetcher,
    })).resolves.toEqual({ _tag: 'available', crons: [] })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account/workers/scripts/worker/schedules',
      { method: 'GET', headers: { Authorization: 'Bearer token' } },
    )

    await expect(loadCloudflareSchedules({
      accountId: 'account',
      scriptName: 'worker',
      token: 'token',
      fetcher: vi.fn().mockRejectedValue(new Error('network down')),
    })).resolves.toMatchObject({
      _tag: 'unavailable',
      reason: 'provider',
      status: null,
    })
  })

  it('refuses unsafe or mutating remote argument combinations', () => {
    expect(parseScheduleParityArgs(['--remote', '--dry-run'])).toEqual({ _tag: 'remote_dry_run' })
    for (const args of [
      ['--remote'],
      ['--write'],
      ['--delete'],
      ['--remote', '--dry-run', '--repair'],
    ])
      expect(parseScheduleParityArgs(args)).toMatchObject({ _tag: 'invalid' })
  })
})
