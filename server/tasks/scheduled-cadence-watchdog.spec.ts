import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEDULE_POLICY } from '#shared/schedule-policy'

const mocks = vi.hoisted(() => ({
  resolveCloudflareBindings: vi.fn(),
  reportJobRun: vi.fn(),
  runTask: vi.fn(),
}))

vi.mock('@harlan-zw/nuxt-cloudflare/bindings', () => ({
  resolveCloudflareBindings: mocks.resolveCloudflareBindings,
}))

vi.mock('~~/server/utils/scheduled-run', () => ({
  runObservedScheduledTask: vi.fn(async (_input: unknown, effect: () => unknown) => await effect()),
}))

vi.mock('~~/server/utils/sync-job-reporter', () => ({
  reportJobRun: mocks.reportJobRun,
}))

vi.mock('nitropack/runtime', () => ({
  runTask: mocks.runTask,
}))

vi.mock('#layers/identity/server/utils/daily-health-check', () => ({
  SCHEDULE_HEALTH_LATEST_RUNS_SQL: 'select 1 as slot',
}))

vi.stubGlobal('defineScheduledTask', (task: unknown) => task)

const task = (await import('./scheduled-cadence-watchdog')).default

const OTHER_TASK = 'backfill-skill-assets'
const QUIET_TASK = 'drain-skill-dirty'

function runRow(input: {
  taskName: string
  status: 'started' | 'succeeded' | 'failed' | 'expired'
  startedAt: number
  expiresAt?: number
  slot?: 'latest' | 'terminal'
  error?: string | null
}) {
  return {
    slot: input.slot ?? 'latest',
    task_name: input.taskName,
    status: input.status,
    started_at: input.startedAt,
    expires_at: input.expiresAt ?? input.startedAt + 240,
    finished_at: input.status === 'started' ? null : input.startedAt + 30,
    error: input.error ?? null,
  }
}

describe('scheduled-cadence-watchdog task', () => {
  interface WatchdogResult {
    result: {
      checked: number
      reinvoked: Array<{ taskName: string, stalled: string }>
      failed: Array<{ taskName: string, error: string }>
      flagged: string[]
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runTask.mockResolvedValue({ result: {} })
    const db = { prepare: vi.fn() }
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: db })
  })

  function withRows(rows: unknown[]) {
    const all = vi.fn().mockResolvedValue({ results: rows })
    const prepare = vi.fn(() => ({ all }))
    const db = { prepare }
    mocks.resolveCloudflareBindings.mockReturnValue({ DB: db })
    return { db, all }
  }

  /** Every policy task mid-run, so a scenario only stalls what it names. */
  function healthyRows(now: number) {
    return SCHEDULE_POLICY.flatMap((policy) => {
      if (policy._tag !== 'observed' || policy.taskName === 'scheduled-cadence-watchdog')
        return []
      return [runRow({ taskName: policy.taskName, status: 'started', startedAt: now - 60, expiresAt: now + 180 })]
    })
  }

  it('re-invokes a task whose latest run went quiet past maxSilenceSeconds', async () => {
    const now = Math.floor(Date.now() / 1000)
    withRows([
      ...healthyRows(now).filter(row => row.task_name !== QUIET_TASK),
      runRow({ taskName: QUIET_TASK, status: 'succeeded', startedAt: now - 21 * 60 }),
    ])

    const result = await task.run({ context: {} } as never) as WatchdogResult

    expect(result).toEqual({
      result: {
        checked: SCHEDULE_POLICY.length - 1,
        reinvoked: [{ taskName: QUIET_TASK, stalled: 'missing_cadence' }],
        failed: [],
        flagged: [],
      },
    })
    expect(mocks.runTask).toHaveBeenCalledOnce()
    expect(mocks.runTask).toHaveBeenCalledWith(QUIET_TASK, {
      payload: {},
      context: expect.objectContaining({ cloudflare: expect.objectContaining({ env: expect.anything() }) }),
    })
    expect(mocks.reportJobRun).toHaveBeenCalledWith(
      expect.anything(),
      'scheduled-cadence-watchdog',
      expect.objectContaining({ cron: '*/5 * * * *', status: 'ok' }),
    )
  })

  it('re-invokes every unobserved task when history is empty and never itself', async () => {
    const now = Math.floor(Date.now() / 1000)
    withRows([
      runRow({
        taskName: 'scheduled-cadence-watchdog',
        status: 'started',
        startedAt: now - 20 * 60,
        expiresAt: now - 16 * 60,
      }),
    ])

    const result = await task.run({ context: {} } as never) as WatchdogResult

    const reinvoked = result.result.reinvoked as Array<{ taskName: string, stalled: string }>
    expect(reinvoked.find(run => run.taskName === 'scheduled-cadence-watchdog')).toBeUndefined()
    expect(reinvoked.find(run => run.taskName === OTHER_TASK))
      .toEqual({ taskName: OTHER_TASK, stalled: 'missing_run' })
    expect(mocks.runTask).toHaveBeenCalledTimes(reinvoked.length)
  })

  it('re-invokes an abandoned started run past its expiry as overdue_started', async () => {
    const now = Math.floor(Date.now() / 1000)
    withRows([
      ...healthyRows(now).filter(row => row.task_name !== OTHER_TASK),
      runRow({
        taskName: OTHER_TASK,
        status: 'started',
        startedAt: now - 10 * 60,
        expiresAt: now - 6 * 60,
      }),
    ])

    const result = await task.run({ context: {} } as never) as WatchdogResult

    expect(result.result.reinvoked).toEqual([{ taskName: OTHER_TASK, stalled: 'overdue_started' }])
    expect(result.result.flagged).toEqual([])
    expect(mocks.runTask).toHaveBeenCalledOnce()
    expect(mocks.runTask).toHaveBeenCalledWith(OTHER_TASK, expect.anything())
  })

  it('leaves recently failed tasks flagged instead of re-invoking them', async () => {
    const now = Math.floor(Date.now() / 1000)
    withRows([
      ...healthyRows(now).filter(row => row.task_name !== 'sync-x-mentions'),
      runRow({
        taskName: 'sync-x-mentions',
        status: 'failed',
        startedAt: now - 5 * 60,
        error: 'github api 500',
      }),
    ])

    const result = await task.run({ context: {} } as never) as WatchdogResult

    expect(result.result.reinvoked).toEqual([])
    expect(result.result.flagged).toEqual(['sync-x-mentions'])
    expect(mocks.runTask).not.toHaveBeenCalled()
  })

  it('records a failed re-invocation without failing the watchdog run', async () => {
    const now = Math.floor(Date.now() / 1000)
    withRows([
      ...healthyRows(now).filter(row => row.task_name !== QUIET_TASK),
      runRow({ taskName: QUIET_TASK, status: 'succeeded', startedAt: now - 21 * 60 }),
    ])
    mocks.runTask.mockRejectedValueOnce(new Error('boom'))

    const result = await task.run({ context: {} } as never) as WatchdogResult

    expect(result.result.failed).toEqual([{ taskName: QUIET_TASK, error: 'boom' }])
    expect(mocks.reportJobRun).toHaveBeenCalledWith(
      expect.anything(),
      'scheduled-cadence-watchdog',
      expect.objectContaining({ status: 'partial', error: expect.stringContaining('boom') }),
    )
  })

  it('gives up on a re-invocation that never settles so the watchdog run still reports', async () => {
    vi.useFakeTimers()
    try {
      const now = Math.floor(Date.now() / 1000)
      withRows([
        ...healthyRows(now).filter(row => row.task_name !== QUIET_TASK),
        runRow({ taskName: QUIET_TASK, status: 'succeeded', startedAt: now - 21 * 60 }),
      ])
      mocks.runTask.mockReturnValue(new Promise(() => {}))

      const watchdogRun = task.run({ context: {} } as never) as Promise<WatchdogResult>
      await vi.advanceTimersByTimeAsync(14 * 60 * 1000)
      const result = await watchdogRun

      expect(result.result.reinvoked).toEqual([])
      expect(result.result.failed).toEqual([
        { taskName: QUIET_TASK, error: expect.stringContaining('budget') },
      ])
      expect(mocks.reportJobRun).toHaveBeenCalledWith(
        expect.anything(),
        'scheduled-cadence-watchdog',
        expect.objectContaining({ status: 'partial' }),
      )
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('reports a missing database binding instead of querying', async () => {
    mocks.resolveCloudflareBindings.mockReturnValue(undefined)

    const result = await task.run({ context: {} } as never) as WatchdogResult

    expect(result).toEqual({ result: { error: 'no-db' } })
    expect(mocks.reportJobRun).not.toHaveBeenCalled()
  })
})
