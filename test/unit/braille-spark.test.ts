import { describe, expect, it } from 'vitest'
import { brailleSpark, sparkCount, sparkLevels, sparkWeek } from '../../shared/braille-spark'

const BLANK = '⠀'

describe('braille spark', () => {
  it('scales seven counts to the busiest day of the week', () => {
    expect(brailleSpark([3, 5, 4, 8, 12, 19, 31])).toBe('⣀⣀⣀⣀⣤⣤⣿')
  })

  it('draws a day with no count as the blank braille cell', () => {
    expect(brailleSpark([1, 0, 2, 2, 6, 9, 7])).toBe(`⣀${BLANK}⣀⣀⣶⣿⣶`)
  })

  it('gives a small count at least the lowest bar', () => {
    expect(sparkLevels([1, 1000, 0, 0, 0, 0, 0])).toEqual([1, 4, 0, 0, 0, 0, 0])
  })

  it('draws a silent week as seven blank cells', () => {
    expect(brailleSpark([0, 0, 0, 0, 0, 0, 0])).toBe(BLANK.repeat(7))
  })

  it('fills every bar when every day is equal', () => {
    expect(brailleSpark([4, 4, 4, 4, 4, 4, 4])).toBe('⣿⣿⣿⣿⣿⣿⣿')
  })

  it.each([
    { name: 'pads missing older days with zero', input: [2, 4], week: [0, 0, 0, 0, 0, 2, 4] },
    { name: 'keeps the newest seven of a longer series', input: [9, 9, 1, 2, 3, 4, 5, 6, 7], week: [1, 2, 3, 4, 5, 6, 7] },
    { name: 'turns bad counts into whole counts of zero or more', input: [-3, Number.NaN, Infinity, 2.9, 0, 1, 5], week: [0, 0, 0, 2, 0, 1, 5] },
    { name: 'reads an empty series as a silent week', input: [], week: [0, 0, 0, 0, 0, 0, 0] },
  ])('$name', ({ input, week }) => {
    expect(sparkWeek(input)).toEqual(week)
  })

  it('always returns seven characters, so rows of sparks stay aligned', () => {
    expect([...brailleSpark([5])]).toHaveLength(7)
  })
})

describe('spark count', () => {
  it.each([
    { count: 1, text: '1 mention' },
    { count: 0, text: '0 mentions' },
    { count: 2, text: '2 mentions' },
    { count: 1204, text: '1,204 mentions' },
  ])('labels $count as "$text"', ({ count, text }) => {
    expect(sparkCount(count)).toBe(text)
  })

  it('agrees with the count for any other unit', () => {
    const posts = { one: 'post', other: 'posts' }
    expect([sparkCount(1, posts), sparkCount(3, posts)]).toEqual(['1 post', '3 posts'])
  })
})
