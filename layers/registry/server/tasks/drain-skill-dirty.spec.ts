import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTaskEnv: vi.fn(),
  reportJobRun: vi.fn(),
}))

vi.mock('#shared/server/task-env', () => ({
  getTaskEnv: mocks.getTaskEnv,
}))

vi.mock('~~/server/utils/sync-job-reporter', () => ({
  reportJobRun: mocks.reportJobRun,
}))

vi.mock('../utils/recompute-scores', () => ({
  recomputeIndexabilityForSkill: vi.fn(),
  recomputeTrustForSkill: vi.fn(),
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
    mocks.getTaskEnv.mockReturnValue({ DB: db })

    const result = await task.run({ context: {} } as never)

    expect(result).toEqual({ result: { drained: 0 } })
    expect(mocks.reportJobRun).toHaveBeenCalledOnce()
    expect(mocks.reportJobRun).toHaveBeenCalledWith(db, 'drain-skill-dirty', {
      cron: '*/5 * * * *',
      status: 'ok',
      durationMs: expect.any(Number),
    })
  })
})
