import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveCloudflareBindings: vi.fn(),
  reportJobRun: vi.fn(),
}))

vi.mock('@harlan-zw/nuxt-cloudflare/bindings', () => ({
  resolveCloudflareBindings: mocks.resolveCloudflareBindings,
}))

vi.mock('~~/server/utils/sync-job-reporter', () => ({
  reportJobRun: mocks.reportJobRun,
}))

vi.mock('~~/server/utils/scheduled-run', () => ({
  runObservedScheduledTask: vi.fn(async (_input, effect) => await effect()),
}))

vi.mock('#shared/schedule-policy', () => ({
  observedSchedulePolicy: vi.fn(() => ({
    _tag: 'observed',
    taskName: 'drain-skill-dirty',
    cron: '*/5 * * * *',
    maxSilenceSeconds: 1200,
    maxRuntimeSeconds: 240,
  })),
}))

vi.mock('../utils/recompute-scores', () => ({
  recomputeIndexabilityForSkill: vi.fn(),
}))

vi.stubGlobal('defineScheduledTask', (task: unknown) => task)

const task = (await import('./drain-skill-dirty')).default

describe('drain-skill-dirty task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports a healthy run when there is no work to drain', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] })
    const bind = vi.fn(() => ({ all }))
    const db = { prepare: vi.fn(() => ({ bind })) }
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: db })

    const result = await task.run({ context: {} } as never)

    expect(result).toEqual({ result: { drained: 0 } })
    expect(mocks.reportJobRun).toHaveBeenCalledOnce()
    expect(mocks.reportJobRun).toHaveBeenCalledWith(db, 'drain-skill-dirty', {
      cron: '*/5 * * * *',
      status: 'ok',
      durationMs: expect.any(Number),
    })
  })

  it('recomputes and removes successful queue entries', async () => {
    const key = { owner: 'acme', repo: 'tools', name: 'review' }
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } })
    const all = vi.fn().mockResolvedValue({ results: [key] })
    const bound = { all, run }
    const bind = vi.fn(() => bound)
    const batch = vi.fn().mockResolvedValue([])
    const db = { prepare: vi.fn(() => ({ bind })), batch }
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: db })

    const result = await task.run({ context: {} } as never)

    expect(result).toEqual({ result: { drained: 1, failed: 0, scanned: 1 } })
    expect(run).toHaveBeenCalledOnce()
    expect(batch).toHaveBeenCalledWith([bound])
    expect(mocks.reportJobRun).toHaveBeenCalledWith(db, 'drain-skill-dirty', {
      cron: '*/5 * * * *',
      status: 'ok',
      durationMs: expect.any(Number),
      error: null,
    })
  })
})
