import { describe, expect, it } from 'vitest'
import { APP_JOB_DEADLINE_MS, jobExpired } from '../src/job-deadline'

const minute = 60 * 1000

describe('app job deadline', () => {
  it('does not count time a job spent waiting behind other jobs', () => {
    const now = Date.now()
    expect(jobExpired({ receivedAt: now - 3 * 60 * minute, startedAt: now - 5 * minute }, now)).toBe(false)
  })

  it('expires a job that has run past the deadline since it started', () => {
    const now = Date.now()
    expect(jobExpired({ receivedAt: now - APP_JOB_DEADLINE_MS - 2 * minute, startedAt: now - APP_JOB_DEADLINE_MS - minute }, now)).toBe(true)
  })

  it('leaves room for a full Harness run and its publication', () => {
    const now = Date.now()
    expect(jobExpired({ receivedAt: now - 50 * minute, startedAt: now - 50 * minute }, now)).toBe(false)
  })
})
