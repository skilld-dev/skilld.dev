import { describe, expect, it } from 'vitest'
import { CRON_EXPECTATIONS, evaluateCronHealth } from '../../scripts/check-cron-health.mjs'

const NOW = Date.parse('2026-07-16T00:00:00Z')

function healthyRows() {
  return CRON_EXPECTATIONS.map(expectation => ({
    cron: expectation.cron,
    datetime: new Date(NOW - Math.min(expectation.maxAgeMs / 2, 30 * 60 * 1000)).toISOString(),
    status: 'success',
  }))
}

describe('cron health', () => {
  it('accepts fresh successful invocations for every schedule', () => {
    const health = evaluateCronHealth(healthyRows(), { nowMs: NOW })

    expect(health.ok).toBe(true)
    expect(health.issues).toEqual([])
  })

  it('flags missing and stale schedules', () => {
    const rows = healthyRows()
      .filter(row => row.cron !== '0 3 * * *')
      .map(row => row.cron === '*/5 * * * *'
        ? { ...row, datetime: new Date(NOW - 20 * 60 * 1000).toISOString() }
        : row)

    const health = evaluateCronHealth(rows, { nowMs: NOW })

    expect(health.ok).toBe(false)
    expect(health.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ cron: '*/5 * * * *', type: 'stale' }),
      expect.objectContaining({ cron: '0 3 * * *', type: 'missing' }),
    ]))
  })

  it('flags consecutive failures but ignores a recovered failure', () => {
    const base = healthyRows().filter(row => row.cron !== '*/5 * * * *')
    const failed = evaluateCronHealth([
      ...base,
      { cron: '*/5 * * * *', datetime: new Date(NOW - 5 * 60 * 1000).toISOString(), status: 'internalError' },
      { cron: '*/5 * * * *', datetime: new Date(NOW - 10 * 60 * 1000).toISOString(), status: 'internalError' },
      { cron: '*/5 * * * *', datetime: new Date(NOW - 15 * 60 * 1000).toISOString(), status: 'success' },
    ], { nowMs: NOW })

    expect(failed.issues).toContainEqual(expect.objectContaining({
      cron: '*/5 * * * *',
      type: 'repeated-failure',
    }))

    const recovered = evaluateCronHealth([
      ...base,
      { cron: '*/5 * * * *', datetime: new Date(NOW - 5 * 60 * 1000).toISOString(), status: 'success' },
      { cron: '*/5 * * * *', datetime: new Date(NOW - 10 * 60 * 1000).toISOString(), status: 'internalError' },
    ], { nowMs: NOW })

    expect(recovered.ok).toBe(true)
  })
})
