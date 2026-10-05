import { describe, expect, it } from 'vitest'
import { mentionsByDay } from '../../shared/mention-days'

const NOW = 1_760_000_000
const HOUR = 3600
const DAY = 24 * HOUR

describe('mentions by day', () => {
  it('counts the past 24 hours as the last day', () => {
    expect(mentionsByDay([NOW - HOUR, NOW - 23 * HOUR], NOW)).toEqual([0, 0, 0, 0, 0, 0, 2])
  })

  it('puts a post from 25 hours ago on the day before', () => {
    expect(mentionsByDay([NOW - 25 * HOUR], NOW)).toEqual([0, 0, 0, 0, 0, 1, 0])
  })

  it('puts the oldest day first', () => {
    expect(mentionsByDay([NOW - 6 * DAY - HOUR], NOW)).toEqual([1, 0, 0, 0, 0, 0, 0])
  })

  it('drops a post older than seven days', () => {
    expect(mentionsByDay([NOW - 7 * DAY, NOW - 20 * DAY], NOW)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('counts a post stamped after the clock as the last day', () => {
    expect(mentionsByDay([NOW + HOUR], NOW)).toEqual([0, 0, 0, 0, 0, 0, 1])
  })
})
